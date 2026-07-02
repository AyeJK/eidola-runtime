import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEngramFromDirectory } from './loader.js';
import { EngramLoadError } from './types.js';

async function writeFixtureEngram(engramDir: string): Promise<void> {
  await mkdir(engramDir, { recursive: true });
  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      'id: fixture-engram',
      'name: Fixture Engram',
      'voice_id: null',
      'meta:',
      '  author: test-author',
      '  created: "2026-06-22"',
      '  tags: [assistant, fixture]',
      'extensions: {}',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(engramDir, 'vessel.yaml'),
    [
      'type: lottie',
      'pack: fixture-pack',
      'expressions:',
      '  idle: idle.json',
      '  waiting: waiting.json',
      'transitions:',
      '  default: crossfade',
      '  duration_ms: 300',
      'playback:',
      '  idle_loops: true',
      '  approval_idle_ms: 3000',
      '  success_hold_ms: 4000',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(engramDir, 'SOUL.md'),
    '# Fixture Engram\n\nA test fixture persona used for loader unit tests.\n',
    'utf8',
  );
}

describe('loadEngramFromDirectory', () => {
  it('loads a release-bundle-style Engram directory', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-loader-fixture-'));
    const engramDir = join(tempRoot, 'fixture-engram');
    await writeFixtureEngram(engramDir);

    const loaded = await loadEngramFromDirectory(engramDir);

    expect(loaded.engram.id).toBe('fixture-engram');
    expect(loaded.engram.engram_version).toBe('1.0.0');
    expect(loaded.engram.name).toBe('Fixture Engram');
    expect(loaded.engram.voice_id).toBeNull();
    expect(loaded.engram.meta.author).toBe('test-author');
    expect(loaded.engram.meta.tags).toEqual(['assistant', 'fixture']);
    expect(loaded.engram.extensions).toEqual({});

    expect(loaded.vessel.type).toBe('lottie');
    expect(loaded.vessel.pack).toBe('fixture-pack');
    expect(loaded.vessel.expressions.idle).toBe('idle.json');
    expect(loaded.vessel.expressions.waiting).toBe('waiting.json');
    expect(loaded.vessel.transitions.default).toBe('crossfade');
    expect(loaded.vessel.transitions.duration_ms).toBe(300);
    expect(loaded.vessel.playback.idle_loops).toBe(true);
    expect(loaded.vessel.playback.approval_idle_ms).toBe(3000);
    expect(loaded.vessel.playback.success_hold_ms).toBe(4000);

    expect(loaded.soul).toContain('Fixture Engram');
    expect(loaded.soul).toContain('test fixture persona');
  });

  it('refuses a malformed engram_version with a clear error', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-engram-'));
    const engramDir = join(tempRoot, 'bad-version');
    await mkdir(engramDir, { recursive: true });

    await writeFile(join(engramDir, 'SOUL.md'), '# Test\n');
    await writeFile(
      join(engramDir, 'vessel.yaml'),
      ['type: lottie', 'pack: test-v1', 'expressions:', '  idle: idle.json'].join('\n'),
    );
    await writeFile(
      join(engramDir, 'engram.yaml'),
      [
        'engram_version: "not-a-version"',
        'id: bad-version',
        'name: Bad Version',
        'voice_id: null',
        'meta:',
        '  author: test',
        '  created: "2026-06-11"',
        'extensions: {}',
      ].join('\n'),
    );

    await expect(loadEngramFromDirectory(engramDir)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(EngramLoadError);
      const loadError = error as EngramLoadError;
      expect(loadError.code).toBe('INVALID_ENGRAM_VERSION');
      expect(loadError.message).toContain('Unrecognised engram_version "not-a-version"');
      return true;
    });
  });

  it('applies defaults for missing optional vessel fields', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-engram-'));
    const engramDir = join(tempRoot, 'minimal-vessel');
    await mkdir(engramDir, { recursive: true });

    await writeFile(join(engramDir, 'SOUL.md'), '# Minimal\n');
    await writeFile(
      join(engramDir, 'vessel.yaml'),
      ['type: lottie', 'pack: minimal-v1', 'expressions:', '  idle: idle.json'].join('\n'),
    );
    await writeFile(
      join(engramDir, 'engram.yaml'),
      [
        'engram_version: "1.0.0"',
        'id: minimal-vessel',
        'name: Minimal Vessel',
        'voice_id: null',
        'meta:',
        '  author: test',
        '  created: "2026-06-11"',
        'extensions: {}',
      ].join('\n'),
    );

    const loaded = await loadEngramFromDirectory(engramDir);
    expect(loaded.vessel.transitions).toEqual({ default: 'crossfade', duration_ms: 300 });
    expect(loaded.vessel.playback).toEqual({
      idle_loops: true,
      approval_idle_ms: 3000,
      success_hold_ms: 3000,
      min_hold_ms: 1000,
      working_exit_hold_ms: 4000,
    });
    expect(loaded.engram.meta.description).toBeUndefined();
    expect(loaded.engram.meta.tags).toBeUndefined();
  });
});
