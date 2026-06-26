import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { findEngramEntry, resolveEngramLocation } from './registry.js';
import { EngramLoadError } from './types.js';

async function writeReleaseBundle(root: string, id: string): Promise<void> {
  const engramDir = join(root, `${id}-engram`);
  const vesselsDir = join(root, 'vessels', 'pack-a');
  await mkdir(engramDir, { recursive: true });
  await mkdir(vesselsDir, { recursive: true });

  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      `id: ${id}`,
      'name: Ponytail',
      'voice_id: null',
      'meta:',
      '  author: test',
      '  created: "2026-06-22"',
      '  description: Test engram.',
      'extensions: {}',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(engramDir, 'vessel.yaml'),
    [
      'type: lottie',
      'pack: pack-a',
      'expressions:',
      '  idle: idle.json',
    ].join('\n'),
    'utf8',
  );

  await writeFile(join(engramDir, 'SOUL.md'), '# Ponytail\n\nTest soul.\n', 'utf8');
  await writeFile(join(vesselsDir, 'idle.json'), '{}', 'utf8');
}

async function writeFlatEngram(engramsDir: string, id: string): Promise<void> {
  const engramDir = join(engramsDir, id);
  const vesselsDir = join(engramsDir, 'vessels', 'pack-a');
  await mkdir(engramDir, { recursive: true });
  await mkdir(vesselsDir, { recursive: true });

  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      `id: ${id}`,
      'name: Flat Engram',
      'voice_id: null',
      'meta:',
      '  author: test',
      '  created: "2026-06-22"',
      '  description: Flat layout engram.',
      'extensions: {}',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(engramDir, 'vessel.yaml'),
    [
      'type: lottie',
      'pack: pack-a',
      'expressions:',
      '  idle: idle.json',
    ].join('\n'),
    'utf8',
  );

  await writeFile(join(engramDir, 'SOUL.md'), '# Flat\n\nTest soul.\n', 'utf8');
  await writeFile(join(vesselsDir, 'idle.json'), '{}', 'utf8');
}

describe('resolveEngramLocation', () => {
  it('resolves nested release bundle paths instead of flat engramsDir/id', async () => {
    const parent = join(tmpdir(), `eidola-registry-${Date.now()}`);
    const release = join(parent, 'ponytail-engram-1.0.0');
    await writeReleaseBundle(release, 'ponytail');

    const located = await resolveEngramLocation(parent, 'ponytail');

    expect(located.directory).toBe(join(release, 'ponytail-engram'));
    expect(located.vesselsDir).toBe(join(release, 'vessels'));
    expect(located.entry?.id).toBe('ponytail');
  });

  it('finds catalog entry by id', async () => {
    const parent = join(tmpdir(), `eidola-find-${Date.now()}`);
    const release = join(parent, 'ponytail-engram-1.0.0');
    await writeReleaseBundle(release, 'ponytail');

    const entry = await findEngramEntry(parent, 'ponytail');

    expect(entry?.engramDir).toBe(join(release, 'ponytail-engram'));
    expect(entry?.vesselsDir).toBe(join(release, 'vessels'));
  });

  it('throws EngramLoadError for missing id instead of flat-path fallback', async () => {
    const parent = join(tmpdir(), `eidola-missing-${Date.now()}`);
    const release = join(parent, 'ponytail-engram-1.0.0');
    await writeReleaseBundle(release, 'ponytail');

    await expect(resolveEngramLocation(parent, 'wrong-id')).rejects.toBeInstanceOf(EngramLoadError);

    try {
      await resolveEngramLocation(parent, 'wrong-id');
    } catch (error) {
      expect(error).toBeInstanceOf(EngramLoadError);
      const loadError = error as EngramLoadError;
      expect(loadError.code).toBe('MISSING_ENGRAM');
      expect(loadError.message).toContain('not found in Eidola folder');
      expect(loadError.message).not.toContain('wrong-id/SOUL.md');
    }
  });

  it('resolves flat engramsDir/{id}/ layout via catalog discovery', async () => {
    const engramsDir = join(tmpdir(), `eidola-flat-${Date.now()}`);
    await writeFlatEngram(engramsDir, 'flat-engram');

    const located = await resolveEngramLocation(engramsDir, 'flat-engram');

    expect(located.directory).toBe(join(engramsDir, 'flat-engram'));
    expect(located.entry?.id).toBe('flat-engram');
  });
});
