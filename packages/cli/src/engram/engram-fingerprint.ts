import { join } from 'node:path';

import { discoverEngramEntries } from './discover-layout.js';

/**
 * Returns true when `dir` contains every requested engram id using the same
 * layout rules as catalog discovery (flat, release bundle, nested bundle).
 */
export async function directoryContainsEngramIds(
  dir: string,
  engramIds: string[],
  options?: { vesselsDir?: string },
): Promise<boolean> {
  const normalized = engramIds.map((id) => id.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return false;
  }

  const vesselsDir = options?.vesselsDir ?? join(dir, 'vessels');
  const entries = await discoverEngramEntries(dir, vesselsDir);
  const foundIds = new Set(entries.map((entry) => entry.id));
  return normalized.every((id) => foundIds.has(id));
}
