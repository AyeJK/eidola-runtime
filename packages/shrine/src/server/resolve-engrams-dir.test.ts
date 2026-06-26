import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveEngramsDirByFingerprint } from './resolve-engrams-dir.js';

const tempRoots: string[] = [];

afterEach(async () => {
  tempRoots.length = 0;
});

async function makeEngramsTree(root: string, engramIds: string[]): Promise<string> {
  const engramsDir = join(root, 'engrams');
  await mkdir(engramsDir, { recursive: true });

  for (const id of engramIds) {
    const engramDir = join(engramsDir, id);
    await mkdir(engramDir, { recursive: true });
    await writeFile(join(engramDir, 'engram.yaml'), `id: ${id}\n`, 'utf8');
  }

  tempRoots.push(root);
  return engramsDir;
}

async function writeReleaseBundle(root: string, id: string): Promise<void> {
  const engramDir = join(root, 'ponytail-engram');
  await mkdir(engramDir, { recursive: true });
  await writeFile(
    join(engramDir, 'engram.yaml'),
    [`id: ${id}`, 'name: Ponytail'].join('\n'),
    'utf8',
  );
  tempRoots.push(root);
}

describe('resolveEngramsDirByFingerprint', () => {
  it('finds a folder by name and engram ids under cwd', async () => {
    const root = join(tmpdir(), `shrine-resolve-${Date.now()}`);
    const engramsDir = await makeEngramsTree(root, ['alpha', 'beta']);

    const resolved = await resolveEngramsDirByFingerprint('engrams', ['alpha', 'beta'], [root]);
    expect(resolved).toBe(engramsDir);
  });

  it('returns null when no folder matches', async () => {
    const root = join(tmpdir(), `shrine-resolve-empty-${Date.now()}`);
    await mkdir(root, { recursive: true });

    const resolved = await resolveEngramsDirByFingerprint('missing-folder', ['nope'], [root]);
    expect(resolved).toBeNull();
  });

  it('finds a release bundle folder by name and yaml id', async () => {
    const root = join(tmpdir(), `ponytail-engram-1.0.0-${Date.now()}`);
    await writeReleaseBundle(root, 'ponytail-engram');

    const resolved = await resolveEngramsDirByFingerprint(
      basename(root),
      ['ponytail-engram'],
      [root],
    );
    expect(resolved).toBe(root);
  });

  it('finds nested release bundle under a parent Eidola folder', async () => {
    const parent = join(tmpdir(), `Eidola-${Date.now()}`);
    const release = join(parent, 'ponytail-engram-1.0.0');
    await mkdir(release, { recursive: true });
    await writeReleaseBundle(release, 'ponytail-engram');

    const resolved = await resolveEngramsDirByFingerprint(
      basename(parent),
      ['ponytail-engram'],
      [parent],
    );
    expect(resolved).toBe(parent);
  });
});
