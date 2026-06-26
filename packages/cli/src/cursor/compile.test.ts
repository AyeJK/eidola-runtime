import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEngramFromDirectory } from '../engram/loader.js';
import { compileSoulToCursorRule, parseCompiledCursorRule } from './compile.js';
import { computeSoulHash } from './hash.js';

async function writeFixtureEngram(engramDir: string): Promise<void> {
  await mkdir(engramDir, { recursive: true });
  await writeFile(
    join(engramDir, 'SOUL.md'),
    '# Fixture Engram\n\nA test fixture persona for compile tests.\n',
  );
  await writeFile(
    join(engramDir, 'vessel.yaml'),
    ['type: lottie', 'pack: fixture-pack', 'expressions:', '  idle: idle.json'].join('\n'),
  );
  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      'id: fixture-engram',
      'name: Fixture Engram',
      'voice_id: null',
      'meta:',
      '  author: test',
      '  created: "2026-06-22"',
      'extensions: {}',
    ].join('\n'),
  );
}

describe('compileSoulToCursorRule', () => {
  it('embeds SOUL.md verbatim in the rule body with no YAML leakage', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-cursor-compile-fixture-'));
    const engramDir = join(tempRoot, 'fixture-engram');
    await writeFixtureEngram(engramDir);

    const loaded = await loadEngramFromDirectory(engramDir);
    const compiled = compileSoulToCursorRule(loaded);
    const { frontmatter, body } = parseCompiledCursorRule(compiled.content);

    expect(body).toBe(loaded.soul);
    expect(body).not.toContain('engram_version');
    expect(body).not.toContain('vessel.yaml');
    expect(frontmatter).toContain('alwaysApply: true');
    expect(frontmatter).toContain('description: "Fixture Engram"');
  });

  it('produces valid frontmatter delimiters', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-cursor-compile-fixture-'));
    const engramDir = join(tempRoot, 'fixture-engram');
    await writeFixtureEngram(engramDir);

    const loaded = await loadEngramFromDirectory(engramDir);
    const compiled = compileSoulToCursorRule(loaded);

    expect(compiled.content.startsWith('---\n')).toBe(true);
    expect(compiled.content).toContain('\n---\n');
    expect(compiled.engramId).toBe('fixture-engram');
    expect(compiled.name).toBe('Fixture Engram');
  });

  it('changes soul_hash when SOUL.md content changes', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-cursor-compile-'));
    const engramDir = join(tempRoot, 'test-soul');
    await mkdir(engramDir, { recursive: true });

    const soulV1 = '# Test Soul\n\nOriginal voice.\n';
    await writeFile(join(engramDir, 'SOUL.md'), soulV1);
    await writeFile(
      join(engramDir, 'vessel.yaml'),
      ['type: lottie', 'pack: test-v1', 'expressions:', '  idle: idle.json'].join('\n'),
    );
    await writeFile(
      join(engramDir, 'engram.yaml'),
      [
        'engram_version: "1.0.0"',
        'id: test-soul',
        'name: Test Soul',
        'voice_id: null',
        'meta:',
        '  author: test',
        '  created: "2026-06-12"',
        'extensions: {}',
      ].join('\n'),
    );

    const loadedV1 = await loadEngramFromDirectory(engramDir);
    const compiledV1 = compileSoulToCursorRule(loadedV1);
    const hashV1 = computeSoulHash(parseCompiledCursorRule(compiledV1.content).body);

    await writeFile(join(engramDir, 'SOUL.md'), '# Test Soul\n\nUpdated voice.\n');
    const loadedV2 = await loadEngramFromDirectory(engramDir);
    const compiledV2 = compileSoulToCursorRule(loadedV2);
    const hashV2 = computeSoulHash(parseCompiledCursorRule(compiledV2.content).body);

    expect(hashV1).not.toBe(hashV2);
    expect(compiledV1.soulHash).toBe(hashV1);
    expect(compiledV2.soulHash).toBe(hashV2);
  });

  it('escapes double quotes in engram name for frontmatter description', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-cursor-compile-'));
    const engramDir = join(tempRoot, 'quoted-name');
    await mkdir(engramDir, { recursive: true });

    await writeFile(join(engramDir, 'SOUL.md'), '# Quoted\n');
    await writeFile(
      join(engramDir, 'vessel.yaml'),
      ['type: lottie', 'pack: test-v1', 'expressions:', '  idle: idle.json'].join('\n'),
    );
    await writeFile(
      join(engramDir, 'engram.yaml'),
      [
        'engram_version: "1.0.0"',
        'id: quoted-name',
        'name: Test "Nickname" Soul',
        'voice_id: null',
        'meta:',
        '  author: test',
        '  created: "2026-06-12"',
        'extensions: {}',
      ].join('\n'),
    );

    const loaded = await loadEngramFromDirectory(engramDir);
    const compiled = compileSoulToCursorRule(loaded);
    const { frontmatter } = parseCompiledCursorRule(compiled.content);

    expect(frontmatter).toContain('description: "Test \\"Nickname\\" Soul"');
  });
});

describe('computeSoulHash', () => {
  it('normalizes CRLF before hashing', () => {
    const lf = 'line one\nline two';
    const crlf = 'line one\r\nline two';
    expect(computeSoulHash(lf)).toBe(computeSoulHash(crlf));
  });
});
