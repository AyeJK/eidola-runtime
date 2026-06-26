import type { EidolaRuntimeConfig } from './config.js';
import { readWorkspaceConfig } from './cursor/workspace-config.js';
import type { SessionState } from './session/state.js';

export interface ActiveEngramResult {
  engramId: string | null;
}

/**
 * Single source of truth for "what's active right now" — the question both
 * Shrine and the MCP `sleep`/awaken-display code need answered. Reconciles
 * Claude Code's in-process `session.getActive()` with Cursor's persisted
 * `active_engram_id`, using the same precedence `auto-activate.ts` already
 * applies when binding on startup: in-process session state wins when
 * present, since it reflects what's actually loaded in this process; the
 * workspace config is the fallback for surfaces (Shrine) that have no
 * session of their own pointing at a *different* Engram than Cursor has on
 * disk.
 */
export async function resolveActiveEngram(
  config: EidolaRuntimeConfig,
  session: SessionState,
): Promise<ActiveEngramResult> {
  const active = session.getActive();
  if (active) {
    return { engramId: active.engram.id };
  }

  if (!config.workspaceRoot) {
    return { engramId: null };
  }

  const workspaceConfig = await readWorkspaceConfig(config.workspaceRoot);
  return { engramId: workspaceConfig?.active_engram_id?.trim() || null };
}
