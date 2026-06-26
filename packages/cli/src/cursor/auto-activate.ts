import { resolve } from 'node:path';
import type { EidolaRuntimeConfig } from '../config.js';
import { resolveEngramLocation } from '../engram/registry.js';
import { EngramLoadError } from '../engram/types.js';
import type { SessionState } from '../session/state.js';
import type { StateSocketServer } from '../socket/server.js';
import { detectSoulSource } from './soul-source.js';
import { warnIfStaleSoulCompile } from './stale.js';
import { cursorRulePath, readWorkspaceConfig } from './workspace-config.js';
import type { EidolaWorkspaceConfig } from './types.js';

export interface AutoActivateResult {
  activated: boolean;
  engramId?: string;
  alreadyActive?: boolean;
  error?: string;
  code?: string;
}

function resolveEngramsDir(
  config: EidolaRuntimeConfig,
  workspaceConfig: EidolaWorkspaceConfig | null,
): string {
  if (workspaceConfig?.engrams_dir) {
    return resolve(workspaceConfig.engrams_dir);
  }

  return config.engramsDir;
}

/**
 * Load active Engram from `.cursor/eidola.json` and broadcast idle to the Shrine.
 * Idempotent when the same Engram is already bound in session.
 */
export async function autoActivateFromWorkspace(
  config: EidolaRuntimeConfig,
  session: SessionState,
  stateSocket: StateSocketServer | undefined,
  onWarn: (message: string) => void = defaultWarn,
): Promise<AutoActivateResult> {
  const workspaceRoot = config.workspaceRoot;
  if (!workspaceRoot) {
    return { activated: false };
  }

  let workspaceConfig: EidolaWorkspaceConfig | null;
  try {
    workspaceConfig = await readWorkspaceConfig(workspaceRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onWarn(`failed to read workspace config: ${message}`);
    return { activated: false, error: message, code: 'WORKSPACE_CONFIG_ERROR' };
  }

  if (!workspaceConfig?.active_engram_id) {
    return { activated: false };
  }

  const engramId = workspaceConfig.active_engram_id;
  const active = session.getActive();
  if (active?.engram.id === engramId) {
    stateSocket?.broadcastState({ state: 'idle', surface: 'manual' });
    return { activated: true, engramId, alreadyActive: true };
  }

  const engramsDir = resolveEngramsDir(config, workspaceConfig);
  let directory: string;
  try {
    const located = await resolveEngramLocation(engramsDir, engramId);
    directory = located.directory;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onWarn(`auto-activate: Engram "${engramId}" not found (${message})`);
    return { activated: false, engramId, error: message, code: 'MISSING_ENGRAM' };
  }

  try {
    const soulSource = await detectSoulSource(workspaceRoot, engramId);
    await session.load(directory, soulSource);
    stateSocket?.broadcastState({ state: 'idle', surface: 'manual' });

    await warnIfStaleSoulCompile({
      engramDirectory: directory,
      mdcPath: cursorRulePath(workspaceRoot, engramId),
      workspaceConfig,
    });

    return { activated: true, engramId };
  } catch (error) {
    if (error instanceof EngramLoadError) {
      onWarn(`auto-activate: ${error.message}`);
      return {
        activated: false,
        engramId,
        error: error.message,
        code: error.code,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    onWarn(`auto-activate failed: ${message}`);
    return { activated: false, engramId, error: message, code: 'INTERNAL_ERROR' };
  }
}

function defaultWarn(message: string): void {
  console.error('[eidola-mcp]', message);
}
