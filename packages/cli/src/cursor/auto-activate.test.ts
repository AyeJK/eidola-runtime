import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveEidolaRuntimeConfig } from '../config.js';
import { autoActivateFromWorkspace } from '../cursor/auto-activate.js';
import { linkEngramToWorkspace } from '../cursor/link-engram.js';
import {
  hasPonytailReleaseBundle,
  PONYTAIL_BUNDLE_DIR,
  requirePonytailReleaseBundle,
} from '../integration/release-bundle-fixture.js';
import { createFixtureEngramsDir, FIXTURE_ENGRAM_ID } from '../integration/local-engram-fixture.js';
import { compileSoulToCursorRule } from '../cursor/compile.js';
import { buildWorkspaceConfig, writeWorkspaceConfig } from '../cursor/workspace-config.js';
import { loadEngramFromDirectory } from '../engram/loader.js';
import { SessionState } from '../session/state.js';
import { createStateSocketServer } from '../socket/server.js';
import type { StateBroadcast } from '../socket/types.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

function connectClient(port: number): Promise<Socket> {
  return new Promise((resolvePromise, reject) => {
    const socket = connect({ port, host: '127.0.0.1' }, () => resolvePromise(socket));
    socket.once('error', reject);
  });
}

async function collectLines(socket: Socket, count: number, timeoutMs = 3000): Promise<string[]> {
  const lines: string[] = [];

  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${count} line(s); got ${lines.length}`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      for (const part of chunk.toString('utf8').split('\n').filter(Boolean)) {
        lines.push(part);
        if (lines.length >= count) {
          cleanup();
          resolvePromise(lines);
          return;
        }
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
    };

    socket.on('data', onData);
  });
}

describe('autoActivateFromWorkspace', () => {
  let tempWorkspace: string | null = null;
  let tempEngramsDir: string | null = null;
  let closeServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }

    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }

    if (tempEngramsDir) {
      await rm(tempEngramsDir, { recursive: true, force: true });
      tempEngramsDir = null;
    }
  });

  async function linkFixtureEngram(workspaceRoot: string): Promise<string> {
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const loaded = await loadEngramFromDirectory(fixture.engramDir);
    const compiled = compileSoulToCursorRule(loaded);
    const rulesDir = join(workspaceRoot, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, `${FIXTURE_ENGRAM_ID}.mdc`), compiled.content, 'utf8');
    await writeWorkspaceConfig(
      workspaceRoot,
      buildWorkspaceConfig({
        engramId: FIXTURE_ENGRAM_ID,
        soulHash: compiled.soulHash,
        engramsDir: fixture.engramsDir,
      }),
    );
    return fixture.engramsDir;
  }

  it('activates vessel and broadcasts idle on MCP startup without load_engram chat', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-auto-activate-'));
    const engramsDir = await linkFixtureEngram(tempWorkspace);

    const session = new SessionState();
    const stateSocket = createStateSocketServer(session, { port: 0 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });

    const overlay = await connectClient(address.port);
    const firstBroadcast = collectLines(overlay, 1);

    const result = await autoActivateFromWorkspace(config, session, stateSocket);

    expect(result.activated).toBe(true);
    expect(result.engramId).toBe(FIXTURE_ENGRAM_ID);
    expect(session.getActive()?.engram.id).toBe(FIXTURE_ENGRAM_ID);
    expect(session.getSoulSource()).toBe('cursor_rule');

    const [line] = await firstBroadcast;
    const broadcast = JSON.parse(line) as StateBroadcast;
    expect(broadcast.engram_id).toBe(FIXTURE_ENGRAM_ID);
    expect(broadcast.state).toBe('idle');
    expect(broadcast.expression).toBe('idle.json');

    overlay.destroy();
  });

  it('reassert reloads vessel when session is already bound', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-reassert-'));
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const session = new SessionState();
    await session.load(fixture.engramDir, 'cursor_rule');

    let stateSocket: ReturnType<typeof createStateSocketServer>;
    stateSocket = createStateSocketServer(session, {
      port: 0,
      onReassertVessel: async () => {
        const reloaded = await session.reloadActive();
        if (reloaded && stateSocket.isListening()) {
          stateSocket.broadcastState({ state: 'idle' });
        }
      },
    });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const overlay = await connectClient(address.port);
    const producer = await connectClient(address.port);

    const next = collectLines(overlay, 1);
    producer.write(
      `${JSON.stringify({
        protocol_version: '1.0',
        ts: Date.now(),
        surface: 'cursor',
        state: 'idle',
        metadata: { reassert_vessel: true },
      })}\n`,
    );

    const [line] = await next;
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(session.getActive()?.engram.id).toBe(FIXTURE_ENGRAM_ID);
    expect(broadcast.engram_id).toBe(FIXTURE_ENGRAM_ID);
    expect(broadcast.state).toBe('idle');

    overlay.destroy();
    producer.destroy();
  });

  it('does not bind an Engram when reassert fires with no active session', async () => {
    const session = new SessionState();

    let stateSocket: ReturnType<typeof createStateSocketServer>;
    stateSocket = createStateSocketServer(session, {
      port: 0,
      onReassertVessel: async () => {
        const reloaded = await session.reloadActive();
        if (reloaded && stateSocket.isListening()) {
          stateSocket.broadcastState({ state: 'idle' });
        }
      },
    });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const producer = await connectClient(address.port);
    producer.write(
      `${JSON.stringify({
        protocol_version: '1.0',
        ts: Date.now(),
        surface: 'cursor',
        state: 'idle',
        metadata: { reassert_vessel: true },
      })}\n`,
    );

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));

    expect(session.getActive()).toBeNull();

    producer.destroy();
  });

  it('returns activated false when workspace config is missing', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-no-config-'));
    const session = new SessionState();
    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_WORKSPACE: tempWorkspace,
    });

    const result = await autoActivateFromWorkspace(config, session);
    expect(result.activated).toBe(false);
    expect(session.getActive()).toBeNull();
  });
});

describe.skipIf(!hasPonytailReleaseBundle())('release-bundle: autoActivateFromWorkspace', () => {
  let tempWorkspace: string | null = null;
  let closeServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }

    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }
  });

  it('loads ponytail release bundle from Documents/Eidola engrams_dir', async () => {
    const fixture = await requirePonytailReleaseBundle();
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-auto-activate-release-'));

    await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: fixture.engramId,
      engramsDir: fixture.engramsDir,
    });

    const session = new SessionState();
    const stateSocket = createStateSocketServer(session, { port: 0 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });

    const overlay = await connectClient(address.port);
    const firstBroadcast = collectLines(overlay, 1);

    const result = await autoActivateFromWorkspace(config, session, stateSocket);

    expect(result.activated).toBe(true);
    expect(result.engramId).toBe(fixture.engramId);
    expect(session.getActive()?.engram.id).toBe(fixture.engramId);
    expect(session.getActive()?.directory).toContain(PONYTAIL_BUNDLE_DIR);

    const [line] = await firstBroadcast;
    const broadcast = JSON.parse(line) as StateBroadcast;
    expect(broadcast.engram_id).toBe(fixture.engramId);
    expect(broadcast.state).toBe('idle');
    expect(broadcast.expression).toBe('idle.mp4');

    overlay.destroy();
  });
});
