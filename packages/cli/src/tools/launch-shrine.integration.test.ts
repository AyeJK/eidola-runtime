import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveEidolaRuntimeConfig } from '../config.js';
import { writeShrineLock } from '../cursor/shrine-lock.js';
import { workspaceConfigPath } from '../cursor/workspace-config.js';
import { SessionState } from '../session/state.js';
import { createStateSocketServer } from '../socket/server.js';
import { createToolHandlers } from './handlers.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('launch_shrine integration', () => {
  let tempWorkspace: string | null = null;

  afterEach(async () => {
    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }
  });

  it('does not skip launch when EIDOLA_WORKSPACE is unset', async () => {
    const config = resolveEidolaRuntimeConfig({ EIDOLA_ROOT: repoRoot });
    const handlers = createToolHandlers(config, new SessionState());

    const result = await handlers.launchShrine();

    expect(result.reason).not.toBe('no_workspace');
    expect(result.ok).toBe(true);
    expect(result.launched || result.already_running).toBe(true);
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/shrine/);
  });

  it('returns already_running when shrine lock is active', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-launch-shrine-'));
    await mkdir(join(tempWorkspace, '.cursor'), { recursive: true });
    await writeShrineLock(tempWorkspace, {
      pid: process.pid,
      surface: 'browser',
      started_at: new Date().toISOString(),
    });

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const handlers = createToolHandlers(config, new SessionState());

    const result = await handlers.launchShrine();

    expect(result.ok).toBe(true);
    expect(result.already_running).toBe(true);
    expect(result.launched).toBe(false);
    expect(result.surface).toBe('browser');
  });

  it('does not auto-awaken when shrine already running', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-launch-shrine-no-awaken-'));
    await mkdir(join(tempWorkspace, '.cursor'), { recursive: true });
    await writeShrineLock(tempWorkspace, {
      pid: process.pid,
      surface: 'browser',
      started_at: new Date().toISOString(),
    });

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const stateSocket = createStateSocketServer(session, { port: 0 });
    await stateSocket.start();
    const handlers = createToolHandlers(config, session, stateSocket);

    const result = await handlers.launchShrine();

    expect(result.ok).toBe(true);
    expect(result.already_running).toBe(true);
    expect(result.expression).toBeUndefined();
    expect(session.getActive()).toBeNull();

    await stateSocket.close();
  });

  it('persists kraken surface and relaunches when lock has different stale surface', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-launch-shrine-kraken-'));
    await mkdir(join(tempWorkspace, '.cursor'), { recursive: true });
    await writeFile(
      workspaceConfigPath(tempWorkspace),
      `${JSON.stringify({ active_engram_id: 'fixture-engram', soul_hash: 'abc', compiled_at: '2020-01-01T00:00:00.000Z' })}\n`,
      'utf8',
    );
    await writeShrineLock(tempWorkspace, {
      pid: 999_999_999,
      surface: 'browser',
      started_at: new Date().toISOString(),
    });

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_WORKSPACE: tempWorkspace,
      EIDOLA_SKIP_SHRINE_LAUNCH: '1',
    });
    const handlers = createToolHandlers(config, new SessionState());

    const result = await handlers.launchShrine({ surface: 'kraken' });

    expect(result.already_running).not.toBe(true);

    const raw = await readFile(workspaceConfigPath(tempWorkspace), 'utf8');
    const persisted = JSON.parse(raw) as { shrine_surface?: string; active_engram_id?: string };
    expect(persisted.shrine_surface).toBe('kraken-elite-v2');
    expect(persisted.active_engram_id).toBe('fixture-engram');
  });
});
