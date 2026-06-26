import { readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setCursorRuleAlwaysApply } from './compile.js';
import { cursorRulePath, readWorkspaceConfig, workspaceConfigPath } from './workspace-config.js';

export interface DeactivateEngramResult {
  ok: true;
  engramId: string;
  mdcDeactivated: boolean;
  configCleared: boolean;
}

/**
 * Inverse of the "deactivate previous Engram" step inside
 * `linkEngramToWorkspace` — exposed on demand for the *currently* active
 * Engram rather than only as a side effect of switching to a different one.
 * Sets `alwaysApply: false` on the Engram's `.mdc` (kept on disk as an inert
 * audit trail, not deleted) and clears `active_engram_id` from
 * `eidola.json` if it still points at this Engram. No-ops on either half
 * when there's nothing to deactivate.
 */
export async function deactivateEngramInWorkspace(
  workspaceRoot: string,
  engramId: string,
): Promise<DeactivateEngramResult> {
  const root = resolve(workspaceRoot);
  const id = engramId.trim();

  let mdcDeactivated = false;
  const mdcPath = cursorRulePath(root, id);
  try {
    const content = await readFile(mdcPath, 'utf8');
    await writeFile(mdcPath, setCursorRuleAlwaysApply(content, false), 'utf8');
    mdcDeactivated = true;
  } catch {
    // No .mdc for this Engram — nothing to deactivate.
  }

  // `active_engram_id` is a required field of EidolaWorkspaceConfig — there is
  // no honest "cleared" value to write, so clearing means deleting the file.
  let configCleared = false;
  const workspaceConfig = await readWorkspaceConfig(root);
  if (workspaceConfig?.active_engram_id === id) {
    try {
      await unlink(workspaceConfigPath(root));
      configCleared = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return { ok: true, engramId: id, mdcDeactivated, configCleared };
}
