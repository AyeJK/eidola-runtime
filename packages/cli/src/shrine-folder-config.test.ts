import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readShrineEngramsDirSync } from './shrine-folder-config.js';

describe('readShrineEngramsDirSync', () => {
  let tempRoot: string;

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns resolved engramsDir when config points at an existing directory', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'eidola-shrine-config-'));
    const engramsDir = join(tempRoot, 'Eidola');
    mkdirSync(engramsDir);
    const configPath = join(tempRoot, 'shrine.json');
    writeFileSync(configPath, JSON.stringify({ engramsDir }, null, 2));

    expect(readShrineEngramsDirSync(configPath)).toBe(resolve(engramsDir));
  });

  it('returns undefined when engramsDir does not exist', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'eidola-shrine-config-'));
    const configPath = join(tempRoot, 'shrine.json');
    writeFileSync(configPath, JSON.stringify({ engramsDir: join(tempRoot, 'missing') }, null, 2));

    expect(readShrineEngramsDirSync(configPath)).toBeUndefined();
  });

  it('returns undefined when config file is missing or invalid', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'eidola-shrine-config-'));
    const configPath = join(tempRoot, 'shrine.json');

    expect(readShrineEngramsDirSync(configPath)).toBeUndefined();

    writeFileSync(configPath, '{ not json');
    expect(readShrineEngramsDirSync(configPath)).toBeUndefined();
  });
});
