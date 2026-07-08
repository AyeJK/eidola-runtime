import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cursorRulePath, readWorkspaceConfig, workspaceConfigPath } from './workspace-config.js';

export interface RemoveEngramResult {
  ok: true;
  engramId: string;
  mdcRemoved: boolean;
  configCleared: boolean;
}

async function unlinkIfExists(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Removes the Cursor artifacts `awaken` wrote for the given Engram —
 * deletes its `.mdc` outright rather than deactivating it in place, so
 * `sleep` behaves the same on Cursor as it does on Claude Code (which
 * deletes the soul file + CLAUDE.md import). Also clears `active_engram_id`
 * from `eidola.json` if it still points at this Engram. No-ops on either
 * half when there's nothing to remove.
 */
export async function removeEngramFromWorkspace(
  workspaceRoot: string,
  engramId: string,
): Promise<RemoveEngramResult> {
  const root = resolve(workspaceRoot);
  const id = engramId.trim();

  const mdcRemoved = await unlinkIfExists(cursorRulePath(root, id));

  // `active_engram_id` is a required field of EidolaWorkspaceConfig — there is
  // no honest "cleared" value to write, so clearing means deleting the file.
  let configCleared = false;
  const workspaceConfig = await readWorkspaceConfig(root);
  if (workspaceConfig?.active_engram_id === id) {
    configCleared = await unlinkIfExists(workspaceConfigPath(root));
  }

  return { ok: true, engramId: id, mdcRemoved, configCleared };
}
