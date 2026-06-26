import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeSoulPath, copySoulToWorkspace, removeSoulFromWorkspace } from '../copy-soul.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('copySoulToWorkspace', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'eidola-copy-soul-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('writes the Soul verbatim to .claude/souls/{engramId}.md, creating directories', async () => {
    const soul = '# My Engram\n\nSome Soul prose.\n';
    const result = await copySoulToWorkspace(workspaceRoot, 'my-engram', soul);

    expect(result.ok).toBe(true);
    expect(result.engramId).toBe('my-engram');

    const written = await readFile(claudeSoulPath(workspaceRoot, 'my-engram'), 'utf8');
    expect(written).toBe(soul);
  });

  it('always overwrites an existing copy on every call', async () => {
    await copySoulToWorkspace(workspaceRoot, 'my-engram', 'Original Soul prose.\n');
    await copySoulToWorkspace(workspaceRoot, 'my-engram', 'Updated Soul prose.\n');

    const written = await readFile(claudeSoulPath(workspaceRoot, 'my-engram'), 'utf8');
    expect(written).toBe('Updated Soul prose.\n');
  });
});

describe('removeSoulFromWorkspace', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'eidola-remove-soul-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('deletes an existing soul file', async () => {
    await copySoulToWorkspace(workspaceRoot, 'my-engram', '# Soul\n');
    const soulPath = claudeSoulPath(workspaceRoot, 'my-engram');
    await expect(fileExists(soulPath)).resolves.toBe(true);

    const result = await removeSoulFromWorkspace(workspaceRoot, 'my-engram');
    expect(result.ok).toBe(true);
    expect(result.removed).toBe(true);
    await expect(fileExists(soulPath)).resolves.toBe(false);
  });

  it('no-ops cleanly when the soul file does not exist', async () => {
    const result = await removeSoulFromWorkspace(workspaceRoot, 'never-existed');
    expect(result.ok).toBe(true);
    expect(result.removed).toBe(false);
  });

  it('only removes the matching engramId, leaving other soul files intact', async () => {
    await copySoulToWorkspace(workspaceRoot, 'keep-me', '# Keep\n');
    await copySoulToWorkspace(workspaceRoot, 'remove-me', '# Remove\n');

    await removeSoulFromWorkspace(workspaceRoot, 'remove-me');

    await expect(fileExists(claudeSoulPath(workspaceRoot, 'remove-me'))).resolves.toBe(false);
    await expect(fileExists(claudeSoulPath(workspaceRoot, 'keep-me'))).resolves.toBe(true);
  });
});
