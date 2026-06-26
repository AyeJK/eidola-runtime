import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as mcp from '../vendor/mcp.js';
import { VesselResolver } from './vessel-resolver.js';

async function writeMinimalEngram(root: string, id: string, pack: string): Promise<string> {
  const engramDir = join(root, `${id}-engram`);
  const vesselsDir = join(root, 'vessels', pack);
  await mkdir(engramDir, { recursive: true });
  await mkdir(vesselsDir, { recursive: true });

  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      `id: ${id}`,
      `name: ${id}`,
      'voice_id: null',
      'meta:',
      '  author: test',
      '  created: "2026-06-22"',
      'extensions: {}',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(engramDir, 'vessel.yaml'),
    [
      'type: lottie',
      `pack: ${pack}`,
      'expressions:',
      '  idle: idle.json',
      'transitions:',
      '  default: crossfade',
      '  duration_ms: 300',
      'playback:',
      '  idle_loops: true',
    ].join('\n'),
    'utf8',
  );

  await writeFile(join(engramDir, 'SOUL.md'), '# Test\n', 'utf8');
  await writeFile(join(vesselsDir, 'idle.json'), '{}', 'utf8');
  return engramDir;
}

describe('VesselResolver', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not emit state payload when engram cannot resolve (no defaultConfig leak)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const locateSpy = vi.spyOn(mcp, 'resolveEngramLocation');

    const engramsDir = join(tmpdir(), `eidola-empty-${Date.now()}`);
    const resolver = new VesselResolver({
      engramsDir,
      vesselsDir: join(tmpdir(), `eidola-vessels-${Date.now()}`),
      folderConfigured: true,
      catalogIds: new Set(['known-engram']),
    });

    const payload = await resolver.buildStatePayload({
      state: 'idle',
      engram_id: 'unknown-engram',
      expression: 'idle.json',
      ts: Date.now(),
      protocol_version: '1.0',
    });

    expect(payload).toBeNull();
    expect(resolver.getConfig()).toBeNull();
    expect(locateSpy).toHaveBeenCalledWith(engramsDir, 'unknown-engram');
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('missing clip "idle.json"'),
    );
  });

  it('skips engram lookup when folder is not configured', async () => {
    const locateSpy = vi.spyOn(mcp, 'resolveEngramLocation');

    const resolver = new VesselResolver({
      engramsDir: '/unused',
      vesselsDir: '/unused/vessels',
      folderConfigured: false,
    });

    const payload = await resolver.buildIdlePayload({
      protocol_version: '1.0',
      ts: Date.now(),
      engram_id: 'any-engram',
    });

    expect(payload).toBeNull();
    expect(resolver.getConfig()).toBeNull();
    expect(locateSpy).not.toHaveBeenCalled();
  });

  it('switches vessel pack when binding a different engram in a multi-bundle folder', async () => {
    const parent = join(tmpdir(), `eidola-multi-${Date.now()}`);
    const bundleA = join(parent, 'alpha-engram-1.0.0');
    const bundleB = join(parent, 'beta-engram-1.0.0');
    const dirA = await writeMinimalEngram(bundleA, 'alpha', 'pack-alpha');
    const dirB = await writeMinimalEngram(bundleB, 'beta', 'pack-beta');
    const vesselsA = join(bundleA, 'vessels');
    const vesselsB = join(bundleB, 'vessels');

    const resolver = new VesselResolver({
      engramsDir: parent,
      vesselsDir: join(parent, 'vessels'),
      folderConfigured: true,
      catalogIds: new Set(['alpha', 'beta']),
    });

    resolver.bindActiveEngram('alpha', dirA, vesselsA);
    await resolver.syncEngram('alpha', dirA);
    const payloadA = await resolver.buildIdlePayload({
      protocol_version: '1.0',
      ts: Date.now(),
      engram_id: 'alpha',
    });
    expect(payloadA?.clipUrl).toContain('pack-alpha/idle.json');

    resolver.bindActiveEngram('beta', dirB, vesselsB);
    await resolver.syncEngram('beta', dirB);
    const payloadB = await resolver.buildIdlePayload({
      protocol_version: '1.0',
      ts: Date.now(),
      engram_id: 'beta',
    });
    expect(payloadB?.clipUrl).toContain('pack-beta/idle.json');
    expect(payloadB?.clipUrl).not.toContain('pack-alpha');
  });
});
