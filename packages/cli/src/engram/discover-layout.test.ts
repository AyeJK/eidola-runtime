import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { discoverEngramEntries } from './discover-layout.js';

async function writeReleaseBundle(root: string): Promise<void> {
  const engramDir = join(root, 'caveman-engram');
  const vesselsDir = join(root, 'vessels', 'new-vessel');
  await mkdir(engramDir, { recursive: true });
  await mkdir(vesselsDir, { recursive: true });

  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      'id: caveman-engram',
      'name: Caveman',
      'voice_id: null',
      'meta:',
      '  author: ayejk',
      '  created: "2026-06-20"',
      '  description: Why use many word when few word do trick.',
      'extensions: {}',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(engramDir, 'vessel.yaml'),
    [
      'type: mp4',
      'pack: new-vessel',
      'expressions:',
      '  idle: grog_idle.mp4',
    ].join('\n'),
    'utf8',
  );

  await writeFile(join(vesselsDir, 'grog_idle.mp4'), 'fake-video', 'utf8');
}

describe('discoverEngramEntries', () => {
  it('finds nested engram and sibling vessels in a release bundle', async () => {
    const root = join(tmpdir(), `eidola-release-${Date.now()}`);
    await writeReleaseBundle(root);

    const entries = await discoverEngramEntries(root, join(root, 'vessels'));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('caveman-engram');
    expect(entries[0]?.name).toBe('Caveman');
    expect(entries[0]?.previewPath).toBe('new-vessel/grog_idle.mp4');
    expect(entries[0]?.vesselType).toBe('mp4');
    expect(entries[0]?.engramDir).toBe(join(root, 'caveman-engram'));
    expect(entries[0]?.vesselsDir).toBe(join(root, 'vessels'));
  });

  it('finds release bundles inside a parent Eidola folder', async () => {
    const parent = join(tmpdir(), `eidola-parent-${Date.now()}`);
    const release = join(parent, 'caveman-engram-1.0.0');
    await writeReleaseBundle(release);

    const entries = await discoverEngramEntries(parent, join(parent, 'vessels'));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('caveman-engram');
    expect(entries[0]?.previewPath).toBe('new-vessel/grog_idle.mp4');
  });
});
