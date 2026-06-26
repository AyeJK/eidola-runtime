import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFixtureEngram } from '../integration/local-engram-fixture.js';
import { deactivateEngramInWorkspace } from './deactivate-engram.js';
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

describe('deactivateEngramInWorkspace', () => {
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

  it('flips alwaysApply to false and clears active_engram_id', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-deactivate-'));
    tempEngrams = await mkdtemp(join(tmpdir(), 'eidola-deactivate-engrams-'));
    await mkdir(tempEngrams, { recursive: true });
    await writeFixtureEngram(tempEngrams, 'fixture-engram');

    await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'fixture-engram',
      engramsDir: tempEngrams,
    });

    const result = await deactivateEngramInWorkspace(tempWorkspace, 'fixture-engram');
    expect(result.ok).toBe(true);
    expect(result.mdcDeactivated).toBe(true);
    expect(result.configCleared).toBe(true);

    const mdc = await readFile(cursorRulePath(tempWorkspace, 'fixture-engram'), 'utf8');
    expect(mdc).toContain('alwaysApply: false');

    await expect(readWorkspaceConfig(tempWorkspace)).resolves.toBeNull();
  });

  it('no-ops when nothing is active', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-deactivate-noop-'));

    const result = await deactivateEngramInWorkspace(tempWorkspace, 'never-awoken');
    expect(result.ok).toBe(true);
    expect(result.mdcDeactivated).toBe(false);
    expect(result.configCleared).toBe(false);

    await expect(pathExists(workspaceConfigPath(tempWorkspace))).resolves.toBe(false);
  });

  it('does not clear config when a different Engram is active', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-deactivate-other-'));
    tempEngrams = await mkdtemp(join(tmpdir(), 'eidola-deactivate-other-engrams-'));
    await mkdir(tempEngrams, { recursive: true });
    await writeFixtureEngram(tempEngrams, 'fixture-engram');

    await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'fixture-engram',
      engramsDir: tempEngrams,
    });

    const result = await deactivateEngramInWorkspace(tempWorkspace, 'some-other-engram');
    expect(result.mdcDeactivated).toBe(false);
    expect(result.configCleared).toBe(false);

    const config = await readWorkspaceConfig(tempWorkspace);
    expect(config?.active_engram_id).toBe('fixture-engram');
  });
});
