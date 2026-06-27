import type { EidolaRuntimeConfig } from '../config.js';
import { resolveActiveEngram } from '../active-engram.js';
import { copySoulToWorkspace, removeSoulFromWorkspace } from '../claude/copy-soul.js';
import {
  ensureSoulImport,
  findActiveSoulImportEngramId,
  removeSoulImport,
} from '../claude/claude-md.js';
import { detectClient, type ClientInfoLike } from '../client-detect.js';
import { deactivateEngramInWorkspace } from '../cursor/deactivate-engram.js';
import { launchShrine } from '../cursor/ensure-shrine.js';
import { linkEngramToWorkspace } from '../cursor/link-engram.js';
import { postShrineAwaken, postShrineSleep } from '../cursor/shrine-awaken.js';
import { detectSoulSource } from '../cursor/soul-source.js';
import { readWorkspaceConfig } from '../cursor/workspace-config.js';
import { loadEngramFromDirectory } from '../engram/loader.js';
import { resolveEngramLocation } from '../engram/registry.js';
import { EngramLoadError } from '../engram/types.js';
import { writeMcpAwakenSignal } from '../cursor/mcp-awaken-signal.js';
import type { SessionState } from '../session/state.js';
import type { StateSocketServer } from '../socket/server.js';
import { buildSoulInjectionPayload } from '../soul/injection.js';

export interface ToolTextResult {
  ok: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export interface EidolaToolHandlers {
  awaken(engramId: string, clientInfo?: ClientInfoLike): Promise<ToolTextResult>;
  sleep(clientInfo?: ClientInfoLike): Promise<ToolTextResult>;
  launchShrine(options?: { surface?: string }): Promise<ToolTextResult>;
}

export function createToolHandlers(
  config: EidolaRuntimeConfig,
  session: SessionState,
  stateSocket?: StateSocketServer,
): EidolaToolHandlers {
  return {
    awaken: (engramId, clientInfo) =>
      handleAwaken(config, session, engramId, stateSocket, clientInfo),
    sleep: (clientInfo) => handleSleep(config, session, clientInfo),
    launchShrine: (options) => handleLaunchShrine(config, options),
  };
}

async function handleAwaken(
  config: EidolaRuntimeConfig,
  session: SessionState,
  engramId: string,
  stateSocket?: StateSocketServer,
  clientInfo?: ClientInfoLike,
): Promise<ToolTextResult> {
  let directory: string;
  let vesselsDir: string;
  try {
    const located = await resolveEngramLocation(config.engramsDir, engramId);
    directory = located.directory;
    vesselsDir = located.vesselsDir;
  } catch (error) {
    if (error instanceof EngramLoadError) {
      return {
        ok: false,
        error: error.message,
        code: error.code,
        engram_id: engramId,
      };
    }
    return toolError(error);
  }

  try {
    let cursorLinked = false;
    let claudeMdLinked = false;
    const detectedClient = detectClient(clientInfo);

    if (config.workspaceRoot) {
      const priorConfig = await readWorkspaceConfig(config.workspaceRoot);

      const linkCursor = detectedClient === 'cursor' || detectedClient === 'unknown';
      const linkClaudeCode = detectedClient === 'claude_code' || detectedClient === 'unknown';

      if (linkCursor) {
        await linkEngramToWorkspace({
          workspaceRoot: config.workspaceRoot,
          engramId,
          engramsDir: config.engramsDir,
          engramDirectory: directory,
          vesselsDir,
          previousEngramId: priorConfig?.active_engram_id,
        });
        cursorLinked = true;
      }

      if (linkClaudeCode) {
        // Switching Engrams on Claude Code deletes the previous Engram's
        // soul file rather than orphaning it. This is a deliberate
        // asymmetry with Cursor: Cursor's `.mdc` deactivates in place
        // (`alwaysApply: false`) and is kept as a visible, cheap audit
        // trail of what was previously active. Claude Code's import-or-
        // nothing model (a single marker block pointing at one soul file)
        // has no equivalent "inert but present" state worth keeping —
        // once the marker block is repointed, the old soul file is just
        // dead weight, so it's removed outright.
        const previousEngramId = await findActiveSoulImportEngramId(config.workspaceRoot);
        if (previousEngramId && previousEngramId !== engramId) {
          await removeSoulFromWorkspace(config.workspaceRoot, previousEngramId);
        }

        const loadedForCopy = await loadEngramFromDirectory(directory);
        await copySoulToWorkspace(config.workspaceRoot, engramId, loadedForCopy.soul);
        await ensureSoulImport(config.workspaceRoot, engramId);
        claudeMdLinked = true;
      }

      await writeMcpAwakenSignal({
        engram_id: engramId,
        workspace_root: config.workspaceRoot,
        engrams_dir: config.engramsDir,
        engram_directory: directory,
        vessels_dir: vesselsDir,
      });
    }

    const soulSource = await detectSoulSource(config.workspaceRoot, engramId);
    const loaded = await session.load(directory, soulSource);
    const soulInjection = buildSoulInjectionPayload(loaded.engram.id, loaded.soul);
    const broadcast = stateSocket?.broadcastState({ state: 'idle', surface: 'manual' });
    const shrineSync = await postShrineAwaken(engramId, config.workspaceRoot);

    return {
      ok: true,
      engram_id: loaded.engram.id,
      name: loaded.engram.name,
      soul_source: soulSource,
      soul_injection: soulInjection,
      detected_client: detectedClient,
      cursor_linked: cursorLinked,
      claude_md_linked: claudeMdLinked,
      shrine_synced: shrineSync.shrine_synced ?? false,
      ...(shrineSync.attempted && !shrineSync.ok
        ? { shrine_sync_warning: shrineSync.error }
        : {}),
      expression: broadcast?.expression ?? loaded.vessel.expressions.idle ?? 'idle.json',
    };
  } catch (error) {
    if (error instanceof EngramLoadError) {
      return {
        ok: false,
        error: error.message,
        code: error.code,
        engram_id: engramId,
      };
    }

    return toolError(error);
  }
}

async function handleSleep(
  config: EidolaRuntimeConfig,
  session: SessionState,
  clientInfo?: ClientInfoLike,
): Promise<ToolTextResult> {
  try {
    const { engramId } = await resolveActiveEngram(config, session);
    if (!engramId) {
      return {
        ok: false,
        error: 'No active Engram to sleep. Call awaken first.',
        code: 'NO_ACTIVE_ENGRAM',
      };
    }

    const detectedClient = detectClient(clientInfo);
    let cursorDeactivated = false;
    let claudeMdRemoved = false;

    if (config.workspaceRoot) {
      const sleepCursor = detectedClient === 'cursor' || detectedClient === 'unknown';
      const sleepClaudeCode = detectedClient === 'claude_code' || detectedClient === 'unknown';

      if (sleepCursor) {
        const result = await deactivateEngramInWorkspace(config.workspaceRoot, engramId);
        cursorDeactivated = result.mdcDeactivated || result.configCleared;
      }

      if (sleepClaudeCode) {
        const removedImport = await removeSoulImport(config.workspaceRoot);
        const removedSoul = await removeSoulFromWorkspace(config.workspaceRoot, engramId);
        claudeMdRemoved = removedImport.removed || removedSoul.removed;
      }
    }

    const shrineSync = await postShrineSleep(engramId, config.workspaceRoot);
    session.clearActive();

    return {
      ok: true,
      engram_id: engramId,
      detected_client: detectedClient,
      cursor_deactivated: cursorDeactivated,
      claude_md_removed: claudeMdRemoved,
      shrine_synced: shrineSync.shrine_synced ?? false,
      ...(shrineSync.attempted && !shrineSync.ok
        ? { shrine_sync_warning: shrineSync.error }
        : {}),
    };
  } catch (error) {
    return toolError(error);
  }
}

async function handleLaunchShrine(
  config: EidolaRuntimeConfig,
  options?: { surface?: string },
): Promise<ToolTextResult> {
  const result = await launchShrine(config, undefined, {
    requestedSurface: options?.surface,
  });

  if (result.skipped) {
    return {
      ok: false,
      error: `Shrine launch skipped (${result.reason ?? 'unknown'})`,
      code: 'SHRINE_LAUNCH_SKIPPED',
      reason: result.reason,
    };
  }

  const ok = result.launched || result.alreadyRunning;

  return {
    ok,
    launched: result.launched,
    already_running: result.alreadyRunning,
    surface: result.surface,
    pid: result.pid,
    mode: result.mode,
    url: result.url,
    restarted: result.restarted,
  };
}

function toolError(error: unknown): ToolTextResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    error: message,
    code: 'INTERNAL_ERROR',
  };
}
