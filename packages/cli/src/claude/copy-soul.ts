import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface CopySoulResult {
  ok: true;
  engramId: string;
  soulPath: string;
}

export interface RemoveSoulResult {
  ok: true;
  engramId: string;
  soulPath: string;
  removed: boolean;
}

export function claudeSoulsDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.claude', 'souls');
}

export function claudeSoulPath(workspaceRoot: string, engramId: string): string {
  return join(claudeSoulsDir(workspaceRoot), `${engramId}.md`);
}

/**
 * Write an Engram's Soul prose verbatim to `.claude/souls/{engramId}.md`.
 * Always overwrites on every call — no hash/stale tracking (mirrors the
 * Cursor `.mdc` write in `link-engram.ts`, minus the stale-detection path).
 */
export async function copySoulToWorkspace(
  workspaceRoot: string,
  engramId: string,
  soul: string,
): Promise<CopySoulResult> {
  const root = resolve(workspaceRoot);
  const id = engramId.trim();

  await mkdir(claudeSoulsDir(root), { recursive: true });
  const soulPath = claudeSoulPath(root, id);
  await writeFile(soulPath, soul, 'utf8');

  return {
    ok: true,
    engramId: id,
    soulPath,
  };
}

/**
 * Delete `.claude/souls/{engramId}.md` if present. No-op (`removed: false`)
 * when the file does not exist — mirrors `copySoulToWorkspace`'s shape.
 */
export async function removeSoulFromWorkspace(
  workspaceRoot: string,
  engramId: string,
): Promise<RemoveSoulResult> {
  const root = resolve(workspaceRoot);
  const id = engramId.trim();
  const soulPath = claudeSoulPath(root, id);

  try {
    await unlink(soulPath);
    return { ok: true, engramId: id, soulPath, removed: true };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ok: true, engramId: id, soulPath, removed: false };
    }
    throw error;
  }
}
