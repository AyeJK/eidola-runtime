import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const CLAUDE_MD_FILENAME = 'CLAUDE.md';

const MARKER_START = '<!-- eidola:soul:start -->';
const MARKER_END = '<!-- eidola:soul:end -->';

export function claudeMdPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), CLAUDE_MD_FILENAME);
}

/**
 * Relative `@import` path for a Soul copy, as written inside CLAUDE.md.
 * Claude Code's `@path` import syntax scans plain text for `@path` tokens
 * and does not parse HTML comments specially — the import line itself
 * must stay uncommented. The marker lines wrapping it are plain HTML
 * comments purely for Eidola's own block detection/replacement; they are
 * outside the `@import` line so they don't interfere with resolution.
 */
function importLineFor(engramId: string): string {
  return `@.claude/souls/${engramId}.md`;
}

function buildMarkerBlock(engramId: string): string {
  return `${MARKER_START}\n${importLineFor(engramId)}\n${MARKER_END}`;
}

function findMarkerBlock(content: string): { start: number; end: number } | null {
  const start = content.indexOf(MARKER_START);
  if (start === -1) {
    return null;
  }
  const endMarkerIndex = content.indexOf(MARKER_END, start);
  if (endMarkerIndex === -1) {
    return null;
  }
  const end = endMarkerIndex + MARKER_END.length;
  return { start, end };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface EnsureSoulImportResult {
  ok: true;
  engramId: string;
  claudeMdPath: string;
  created: boolean;
}

/**
 * Ensure CLAUDE.md contains a marker block importing the active Engram's
 * Soul copy (written by `copySoulToWorkspace`). Creates CLAUDE.md if
 * absent. On re-run, replaces only the import path inside the existing
 * marker block — all other content, including anything outside the
 * block, is left untouched.
 */
export async function ensureSoulImport(
  workspaceRoot: string,
  engramId: string,
): Promise<EnsureSoulImportResult> {
  const root = resolve(workspaceRoot);
  const id = engramId.trim();
  const path = claudeMdPath(root);

  const exists = await fileExists(path);
  const block = buildMarkerBlock(id);

  if (!exists) {
    await writeFile(path, `${block}\n`, 'utf8');
    return { ok: true, engramId: id, claudeMdPath: path, created: true };
  }

  const existing = await readFile(path, 'utf8');
  const found = findMarkerBlock(existing);

  let updated: string;
  if (found) {
    updated = `${existing.slice(0, found.start)}${block}${existing.slice(found.end)}`;
  } else {
    const separator = existing.endsWith('\n') ? '' : '\n';
    const spacer = existing.length > 0 ? '\n' : '';
    updated = `${existing}${separator}${spacer}${block}\n`;
  }

  if (updated !== existing) {
    await writeFile(path, updated, 'utf8');
  }

  return { ok: true, engramId: id, claudeMdPath: path, created: false };
}

export interface RemoveSoulImportResult {
  ok: true;
  claudeMdPath: string;
  removed: boolean;
}

/**
 * Remove the Eidola Soul marker block from CLAUDE.md, including the single
 * blank-line spacer `ensureSoulImport` inserts before a freshly-appended
 * block. No-ops (`removed: false`) when CLAUDE.md is absent or contains no
 * marker block — never touches content outside the block.
 */
export async function removeSoulImport(workspaceRoot: string): Promise<RemoveSoulImportResult> {
  const root = resolve(workspaceRoot);
  const path = claudeMdPath(root);

  if (!(await fileExists(path))) {
    return { ok: true, claudeMdPath: path, removed: false };
  }

  const existing = await readFile(path, 'utf8');
  const found = findMarkerBlock(existing);
  if (!found) {
    return { ok: true, claudeMdPath: path, removed: false };
  }

  let start = found.start;
  // Eat the blank-line spacer `ensureSoulImport` adds before an appended block.
  if (start >= 2 && existing.slice(start - 2, start) === '\n\n') {
    start -= 1;
  }

  let end = found.end;
  if (existing.slice(end, end + 1) === '\n') {
    end += 1;
  }

  const updated = `${existing.slice(0, start)}${existing.slice(end)}`;
  await writeFile(path, updated, 'utf8');

  return { ok: true, claudeMdPath: path, removed: true };
}

/** True when CLAUDE.md exists and contains the Eidola Soul marker block. */
export async function hasClaudeMdSoulImport(workspaceRoot: string): Promise<boolean> {
  const path = claudeMdPath(workspaceRoot);
  if (!(await fileExists(path))) {
    return false;
  }
  const content = await readFile(path, 'utf8');
  return findMarkerBlock(content) !== null;
}

const IMPORT_LINE_PATTERN = /^@\.claude\/souls\/(.+)\.md$/m;

/**
 * Read the Engram id currently imported by the marker block, if any. Used
 * before repointing the block to a new Engram, so the caller can clean up
 * the previous Engram's `.claude/souls/{id}.md` instead of orphaning it.
 * Returns `null` when CLAUDE.md is absent, has no marker block, or the
 * block's import line doesn't match the expected `@.claude/souls/{id}.md`
 * shape (e.g. hand-edited by a user).
 */
export async function findActiveSoulImportEngramId(
  workspaceRoot: string,
): Promise<string | null> {
  const path = claudeMdPath(workspaceRoot);
  if (!(await fileExists(path))) {
    return null;
  }

  const content = await readFile(path, 'utf8');
  const found = findMarkerBlock(content);
  if (!found) {
    return null;
  }

  const block = content.slice(found.start, found.end);
  const match = block.match(IMPORT_LINE_PATTERN);
  return match ? match[1] : null;
}
