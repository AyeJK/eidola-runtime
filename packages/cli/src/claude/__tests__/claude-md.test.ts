import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  claudeMdPath,
  ensureSoulImport,
  findActiveSoulImportEngramId,
  hasClaudeMdSoulImport,
  removeSoulImport,
} from '../claude-md.js';

describe('ensureSoulImport', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'eidola-claude-md-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('creates CLAUDE.md with a marker block when absent', async () => {
    const result = await ensureSoulImport(workspaceRoot, 'my-engram');

    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);

    const content = await readFile(claudeMdPath(workspaceRoot), 'utf8');
    expect(content).toContain('<!-- eidola:soul:start -->');
    expect(content).toContain('<!-- eidola:soul:end -->');
    expect(content).toContain('@.claude/souls/my-engram.md');
  });

  it('is idempotent on re-run with the same Engram id', async () => {
    await ensureSoulImport(workspaceRoot, 'my-engram');
    const first = await readFile(claudeMdPath(workspaceRoot), 'utf8');

    const result = await ensureSoulImport(workspaceRoot, 'my-engram');
    const second = await readFile(claudeMdPath(workspaceRoot), 'utf8');

    expect(result.created).toBe(false);
    expect(second).toBe(first);
  });

  it('replaces only the import path inside the marker block when switching Engrams', async () => {
    await ensureSoulImport(workspaceRoot, 'first-engram');
    const result = await ensureSoulImport(workspaceRoot, 'second-engram');

    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);

    const content = await readFile(claudeMdPath(workspaceRoot), 'utf8');
    expect(content).toContain('@.claude/souls/second-engram.md');
    expect(content).not.toContain('@.claude/souls/first-engram.md');

    // Only one marker block should exist — no duplication.
    const startCount = content.split('<!-- eidola:soul:start -->').length - 1;
    expect(startCount).toBe(1);
  });

  it('leaves user-authored content outside the marker block untouched', async () => {
    const path = claudeMdPath(workspaceRoot);
    const userContent = '# My Project\n\nSome notes about the project.\n\nMore details here.\n';
    await writeFile(path, userContent, 'utf8');

    await ensureSoulImport(workspaceRoot, 'my-engram');
    const afterFirst = await readFile(path, 'utf8');
    expect(afterFirst.startsWith(userContent.trimEnd())).toBe(true);
    expect(afterFirst).toContain('@.claude/souls/my-engram.md');

    await ensureSoulImport(workspaceRoot, 'switched-engram');
    const afterSwitch = await readFile(path, 'utf8');
    expect(afterSwitch).toContain('# My Project');
    expect(afterSwitch).toContain('Some notes about the project.');
    expect(afterSwitch).toContain('More details here.');
    expect(afterSwitch).toContain('@.claude/souls/switched-engram.md');
    expect(afterSwitch).not.toContain('@.claude/souls/my-engram.md');
  });

  it('hasClaudeMdSoulImport reports false before creation and true after', async () => {
    await expect(hasClaudeMdSoulImport(workspaceRoot)).resolves.toBe(false);
    await ensureSoulImport(workspaceRoot, 'my-engram');
    await expect(hasClaudeMdSoulImport(workspaceRoot)).resolves.toBe(true);
  });
});

describe('removeSoulImport', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'eidola-claude-md-remove-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('removes an existing marker block', async () => {
    await ensureSoulImport(workspaceRoot, 'my-engram');

    const result = await removeSoulImport(workspaceRoot);
    expect(result.ok).toBe(true);
    expect(result.removed).toBe(true);

    const content = await readFile(claudeMdPath(workspaceRoot), 'utf8');
    expect(content).not.toContain('<!-- eidola:soul:start -->');
    expect(content).not.toContain('<!-- eidola:soul:end -->');
    expect(content).not.toContain('@.claude/souls/my-engram.md');
    await expect(hasClaudeMdSoulImport(workspaceRoot)).resolves.toBe(false);
  });

  it('no-ops cleanly when CLAUDE.md does not exist', async () => {
    const result = await removeSoulImport(workspaceRoot);
    expect(result.ok).toBe(true);
    expect(result.removed).toBe(false);
  });

  it('no-ops cleanly when CLAUDE.md exists but has no marker block', async () => {
    const path = claudeMdPath(workspaceRoot);
    const userContent = '# My Project\n\nSome notes.\n';
    await writeFile(path, userContent, 'utf8');

    const result = await removeSoulImport(workspaceRoot);
    expect(result.ok).toBe(true);
    expect(result.removed).toBe(false);

    const content = await readFile(path, 'utf8');
    expect(content).toBe(userContent);
  });

  it('leaves surrounding user content untouched, including the spacer it removes', async () => {
    const path = claudeMdPath(workspaceRoot);
    const userContent = '# My Project\n\nSome notes about the project.\n\nMore details here.\n';
    await writeFile(path, userContent, 'utf8');

    await ensureSoulImport(workspaceRoot, 'my-engram');
    const result = await removeSoulImport(workspaceRoot);
    expect(result.removed).toBe(true);

    const content = await readFile(path, 'utf8');
    expect(content).toContain('# My Project');
    expect(content).toContain('Some notes about the project.');
    expect(content).toContain('More details here.');
    expect(content).not.toContain('@.claude/souls/my-engram.md');
    expect(content.endsWith('\n\n\n')).toBe(false);
  });

  it('re-awakening after a sleep produces a clean CLAUDE.md with no leftover marker block', async () => {
    await ensureSoulImport(workspaceRoot, 'first-engram');
    await removeSoulImport(workspaceRoot);
    await ensureSoulImport(workspaceRoot, 'second-engram');

    const content = await readFile(claudeMdPath(workspaceRoot), 'utf8');
    const startCount = content.split('<!-- eidola:soul:start -->').length - 1;
    expect(startCount).toBe(1);
    expect(content).toContain('@.claude/souls/second-engram.md');
    expect(content).not.toContain('@.claude/souls/first-engram.md');
  });
});

describe('findActiveSoulImportEngramId', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'eidola-claude-md-find-active-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('returns null when CLAUDE.md does not exist', async () => {
    await expect(findActiveSoulImportEngramId(workspaceRoot)).resolves.toBeNull();
  });

  it('returns null when CLAUDE.md exists but has no marker block', async () => {
    await writeFile(claudeMdPath(workspaceRoot), '# My Project\n', 'utf8');
    await expect(findActiveSoulImportEngramId(workspaceRoot)).resolves.toBeNull();
  });

  it('returns the engram id from the current marker block', async () => {
    await ensureSoulImport(workspaceRoot, 'my-engram');
    await expect(findActiveSoulImportEngramId(workspaceRoot)).resolves.toBe('my-engram');
  });

  it('reflects the most recently repointed import after a switch', async () => {
    await ensureSoulImport(workspaceRoot, 'first-engram');
    await ensureSoulImport(workspaceRoot, 'second-engram');
    await expect(findActiveSoulImportEngramId(workspaceRoot)).resolves.toBe('second-engram');
  });
});
