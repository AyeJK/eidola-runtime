import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { directoryContainsEngramIds } from './engram-fingerprint.js';

describe('directoryContainsEngramIds', () => {
  it('matches flat engram folders by yaml id', async () => {
    const root = join(tmpdir(), `fingerprint-flat-${Date.now()}`);
    await mkdir(join(root, 'alpha'), { recursive: true });
    await writeFile(join(root, 'alpha', 'engram.yaml'), 'id: alpha\n', 'utf8');

    await expect(directoryContainsEngramIds(root, ['alpha'])).resolves.toBe(true);
    await expect(directoryContainsEngramIds(root, ['beta'])).resolves.toBe(false);
  });

  it('matches release bundle layout', async () => {
    const root = join(tmpdir(), `fingerprint-release-${Date.now()}`);
    const engramDir = join(root, 'ponytail-engram');
    await mkdir(engramDir, { recursive: true });
    await writeFile(join(engramDir, 'engram.yaml'), 'id: ponytail-engram\n', 'utf8');

    await expect(directoryContainsEngramIds(root, ['ponytail-engram'])).resolves.toBe(true);
  });

  it('matches nested release bundle under a parent folder', async () => {
    const parent = join(tmpdir(), `fingerprint-parent-${Date.now()}`);
    const release = join(parent, 'ponytail-engram-1.0.0');
    const engramDir = join(release, 'ponytail-engram');
    await mkdir(engramDir, { recursive: true });
    await writeFile(join(engramDir, 'engram.yaml'), 'id: ponytail-engram\n', 'utf8');

    await expect(directoryContainsEngramIds(parent, ['ponytail-engram'])).resolves.toBe(true);
  });
});
