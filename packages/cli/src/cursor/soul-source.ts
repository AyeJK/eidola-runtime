import { access } from 'node:fs/promises';
import { hasClaudeMdSoulImport } from '../claude/claude-md.js';
import { cursorRulePath } from './workspace-config.js';

export type SoulSource = 'cursor_rule' | 'claude_md' | 'both' | 'injection' | 'none';

/**
 * Detect which static Soul artifact(s) exist for an Engram in a workspace.
 * Informational only as of Sprint 5.1.1 — `awaken` always returns
 * `soul_injection` regardless of this result; callers should not gate
 * injection on the returned value anymore.
 */
export async function detectSoulSource(
  workspaceRoot: string | undefined,
  engramId: string,
): Promise<Exclude<SoulSource, 'none'>> {
  if (!workspaceRoot) {
    return 'injection';
  }

  let hasCursorRule = false;
  try {
    await access(cursorRulePath(workspaceRoot, engramId));
    hasCursorRule = true;
  } catch {
    hasCursorRule = false;
  }

  const hasClaudeMd = await hasClaudeMdSoulImport(workspaceRoot);

  if (hasCursorRule && hasClaudeMd) {
    return 'both';
  }
  if (hasCursorRule) {
    return 'cursor_rule';
  }
  if (hasClaudeMd) {
    return 'claude_md';
  }
  return 'injection';
}
