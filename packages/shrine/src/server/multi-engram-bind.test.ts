import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { listEngramDirectories } from '../vendor/mcp.js';

/**
 * Multi-engram integration scenario (Sprint 4.3.2):
 * Two release bundles in one Eidola folder must each expose distinct vesselsDir paths
 * so Shrine can re-bind per Awaken / socket broadcast without restart.
 */
async function writeReleaseBundle(root: string, id: string, pack: string): Promise<void> {
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
    ].join('\n'),
    'utf8',
  );

  await writeFile(join(engramDir, 'SOUL.md'), '# Test\n', 'utf8');
  await writeFile(join(vesselsDir, 'idle.json'), '{}', 'utf8');
}

describe('multi-engram catalog bind', () => {
  it('discovers two release bundles with distinct vessels roots for per-engram re-bind', async () => {
    const eidolaFolder = join(tmpdir(), `eidola-two-bundles-${Date.now()}`);
    const bundleA = join(eidolaFolder, 'alpha-engram-1.0.0');
    const bundleB = join(eidolaFolder, 'beta-engram-1.0.0');
    await writeReleaseBundle(bundleA, 'alpha', 'pack-a');
    await writeReleaseBundle(bundleB, 'beta', 'pack-b');

    const catalog = await listEngramDirectories(eidolaFolder);
    const byId = new Map(catalog.map((entry) => [entry.id, entry]));

    expect(byId.get('alpha')?.vesselsDir).toBe(join(bundleA, 'vessels'));
    expect(byId.get('beta')?.vesselsDir).toBe(join(bundleB, 'vessels'));
    expect(byId.get('alpha')?.vesselsDir).not.toBe(byId.get('beta')?.vesselsDir);

    // Shrine server bindResolverFromCatalog(engramId) uses these per-id paths on each broadcast.
    const simulateBind = (engramId: string) => byId.get(engramId)?.vesselsDir;
    expect(simulateBind('alpha')).toContain('alpha-engram-1.0.0');
    expect(simulateBind('beta')).toContain('beta-engram-1.0.0');
  });
});
