import { join } from 'node:path';
import { discoverEngramEntries } from './discover-layout.js';
import type { EngramListEntry } from './registry-types.js';
import { EngramLoadError } from './types.js';

export type { EngramListEntry } from './registry-types.js';

export async function listEngramDirectories(
  engramsDir: string,
  options?: { vesselsDir?: string },
): Promise<EngramListEntry[]> {
  const defaultVesselsDir = options?.vesselsDir ?? join(engramsDir, 'vessels');
  return discoverEngramEntries(engramsDir, defaultVesselsDir);
}

export function resolveEngramDirectory(engramsDir: string, engramId: string): string {
  const normalized = engramId.trim();
  if (!normalized || normalized.includes('..') || /[/\\]/.test(normalized)) {
    throw new Error(`Invalid engram_id "${engramId}".`);
  }

  return join(engramsDir, normalized);
}

export async function findEngramEntry(
  engramsDir: string,
  engramId: string,
  options?: { vesselsDir?: string },
): Promise<EngramListEntry | null> {
  const normalized = engramId.trim();
  if (!normalized) {
    return null;
  }

  const entries = await listEngramDirectories(engramsDir, options);
  return entries.find((entry) => entry.id === normalized) ?? null;
}

export async function resolveEngramLocation(
  engramsDir: string,
  engramId: string,
  options?: { vesselsDir?: string },
): Promise<{ directory: string; vesselsDir: string; entry: EngramListEntry | null }> {
  const normalized = engramId.trim();
  if (!normalized) {
    throw new EngramLoadError('Engram id is required.', 'INVALID_ENGRAM_ID');
  }

  // Catalog discovery covers both nested release-bundle layouts and flat
  // engramsDir/{id}/engram.yaml layouts (see discoverEngramEntries' scanReleaseBundle
  // pass) — there is no separate flat-path fallback needed.
  const entry = await findEngramEntry(engramsDir, normalized, options);
  if (entry) {
    return {
      directory: entry.engramDir,
      vesselsDir: entry.vesselsDir,
      entry,
    };
  }

  throw new EngramLoadError(
    `Engram "${normalized}" not found in Eidola folder. Check active_engram_id in .cursor/eidola.json and that the Engram is installed under ${engramsDir}.`,
    'MISSING_ENGRAM',
    engramsDir,
  );
}
