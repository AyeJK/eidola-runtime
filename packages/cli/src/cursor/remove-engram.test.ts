import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFixtureEngram } from '../integration/local-engram-fixture.js';
import { removeEngramFromWorkspace } from './remove-engram.js';
import { linkEngramToWorkspace } from './link-engram.js';
import { cursorRulePath, readWorkspaceConfig, workspaceConfigPath } from './workspace-config.js';

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

describe('removeEngramFromWorkspace', () => {
  let tempWorkspace: string | null = null;
  let tempEngrams: string | null = null;

  afterEach(async () => {
    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }
    if (tempEngrams) {
      await rm(tempEngrams, { recursive: true, force: true });
      tempEngrams = null;
    }
  });

  it('deletes the .mdc and clears active_engram_id', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-remove-engram-'));
    tempEngrams = await mkdtemp(join(tmpdir(), 'eidola-remove-engram-engrams-'));
    await mkdir(tempEngrams, { recursive: true });
    await writeFixtureEngram(tempEngrams, 'fixture-engram');

    await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'fixture-engram',
      engramsDir: tempEngrams,
    });

    const result = await removeEngramFromWorkspace(tempWorkspace, 'fixture-engram');
    expect(result.ok).toBe(true);
    expect(result.mdcRemoved).toBe(true);
    expect(result.configCleared).toBe(true);

    await expect(pathExists(cursorRulePath(tempWorkspace, 'fixture-engram'))).resolves.toBe(false);
    await expect(readWorkspaceConfig(tempWorkspace)).resolves.toBeNull();
  });

  it('no-ops when nothing is active', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-remove-engram-noop-'));

    const result = await removeEngramFromWorkspace(tempWorkspace, 'never-awoken');
    expect(result.ok).toBe(true);
    expect(result.mdcRemoved).toBe(false);
    expect(result.configCleared).toBe(false);

    await expect(pathExists(workspaceConfigPath(tempWorkspace))).resolves.toBe(false);
  });

  it('does not clear config when a different Engram is active', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-remove-engram-other-'));
    tempEngrams = await mkdtemp(join(tmpdir(), 'eidola-remove-engram-other-engrams-'));
    await mkdir(tempEngrams, { recursive: true });
    await writeFixtureEngram(tempEngrams, 'fixture-engram');

    await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'fixture-engram',
      engramsDir: tempEngrams,
    });

    const result = await removeEngramFromWorkspace(tempWorkspace, 'some-other-engram');
    expect(result.mdcRemoved).toBe(false);
    expect(result.configCleared).toBe(false);

    const config = await readWorkspaceConfig(tempWorkspace);
    expect(config?.active_engram_id).toBe('fixture-engram');
  });
});
