import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function collectWorkspaceSpecifiers(pkg: Record<string, unknown>): string[] {
  const hits: string[] = [];
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const entries = pkg[section];
    if (!entries || typeof entries !== 'object') {
      continue;
    }
    for (const [name, version] of Object.entries(entries as Record<string, string>)) {
      if (String(version).startsWith('workspace:')) {
        hits.push(`${section}.${name}=${version}`);
      }
    }
  }
  return hits;
}

describe('publish manifest', () => {
  it('dist/package.json has no workspace protocol specifiers', async () => {
    const raw = await readFile(join(packageRoot, 'dist', 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    expect(collectWorkspaceSpecifiers(pkg)).toEqual([]);
  });
});
