import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { directoryContainsEngramIds } from '../vendor/mcp.js';

import { expandHomePath } from '../shared/shrine-folder-config.js';

const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '.cursor', 'AppData', 'Local', 'Roaming']);

export function buildSearchRoots(): string[] {
  const roots = new Set<string>();

  const add = (input: string | undefined) => {
    if (!input?.trim()) {
      return;
    }

    const resolved = resolve(expandHomePath(input.trim()));
    if (existsSync(resolved)) {
      roots.add(resolved);
    }
  };

  add(process.cwd());
  add(process.env.EIDOLA_ROOT);
  add(join(homedir(), 'projects'));
  add(join(homedir(), 'Documents'));
  add(join(homedir(), 'caminaOS'));
  add(join(homedir(), 'dev'));
  add(join(homedir(), 'code'));
  add(join(homedir(), 'src'));

  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    add(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return [...roots];
}

async function directoryMatchesFingerprint(dir: string, engramIds: string[]): Promise<boolean> {
  if (!existsSync(dir)) {
    return false;
  }

  return directoryContainsEngramIds(dir, engramIds);
}

async function walkForMatch(
  dir: string,
  folderName: string,
  engramIds: string[],
  matches: string[],
  depth: number,
  maxDepth: number,
): Promise<void> {
  if (depth > maxDepth) {
    return;
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (basename(dir) === folderName && (await directoryMatchesFingerprint(dir, engramIds))) {
    matches.push(resolve(dir));
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIR_NAMES.has(entry.name)) {
      continue;
    }

    await walkForMatch(join(dir, entry.name), folderName, engramIds, matches, depth + 1, maxDepth);
  }
}

export async function resolveEngramsDirByFingerprint(
  folderName: string,
  engramIds: string[],
  searchRoots: string[] = buildSearchRoots(),
): Promise<string | null> {
  const trimmedName = folderName.trim();
  if (!trimmedName) {
    return null;
  }

  const normalizedIds = engramIds.map((id) => id.trim()).filter(Boolean);
  const matches: string[] = [];

  for (const root of searchRoots) {
    const direct = join(root, trimmedName);
    if (basename(direct) === trimmedName && (await directoryMatchesFingerprint(direct, normalizedIds))) {
      matches.push(resolve(direct));
    }

    await walkForMatch(root, trimmedName, normalizedIds, matches, 0, 8);
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0]!;
  }

  const cwd = resolve(process.cwd());
  const underCwd = matches.filter((match) => match.startsWith(cwd));
  if (underCwd.length === 1) {
    return underCwd[0]!;
  }

  return matches.sort((a, b) => a.length - b.length)[0] ?? null;
}
