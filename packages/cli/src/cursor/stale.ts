import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computeSoulHash } from './hash.js';
import { parseCompiledCursorRule } from './compile.js';
import type { EidolaWorkspaceConfig } from './types.js';

export interface StaleSoulCompileCheck {
  engramDirectory: string;
  mdcPath: string;
  workspaceConfig?: EidolaWorkspaceConfig;
}

/**
 * Warn on stderr when SOUL.md content no longer matches the compiled rule hash.
 * Non-blocking — MCP startup and link-engram validation call this for visibility only.
 */
export async function warnIfStaleSoulCompile(check: StaleSoulCompileCheck): Promise<boolean> {
  const soulPath = join(check.engramDirectory, 'SOUL.md');
  let soulContent: string;
  try {
    soulContent = await readFile(soulPath, 'utf8');
  } catch {
    return false;
  }

  const currentHash = computeSoulHash(soulContent);
  const storedHash = check.workspaceConfig?.soul_hash;

  if (storedHash && storedHash !== currentHash) {
    const engramId = check.workspaceConfig?.active_engram_id ?? 'unknown';
    console.error(
      `[eidola] Stale Cursor rule: SOUL.md changed since last compile (hash mismatch). Re-run: pnpm link-engram ${engramId}`,
    );
    return true;
  }

  let mdcContent: string;
  try {
    mdcContent = await readFile(check.mdcPath, 'utf8');
  } catch {
    return false;
  }

  const { body } = parseCompiledCursorRule(mdcContent);
  const compiledBodyHash = computeSoulHash(body);

  if (compiledBodyHash !== currentHash) {
    const engramId = check.workspaceConfig?.active_engram_id ?? 'unknown';
    console.error(
      `[eidola] Stale Cursor rule: compiled .mdc body does not match SOUL.md. Re-run: pnpm link-engram ${engramId}`,
    );
    return true;
  }

  return false;
}
