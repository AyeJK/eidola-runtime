import { connect, type Socket } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import { describe, expect, it, afterEach } from 'vitest';
import { resolveEidolaRuntimeConfig } from '../config.js';
import { createFixtureEngramsDir, FIXTURE_ENGRAM_ID } from './local-engram-fixture.js';
import { SessionState } from '../session/state.js';
import { createStateSocketServer } from '../socket/server.js';
import type { StateBroadcast, StateInboundEvent } from '../socket/types.js';
import { createToolHandlers } from '../tools/handlers.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

/** Cursor extension lifecycle → socket state (see mapLifecycle.ts). */
const CURSOR_LIFECYCLE_STATES = [
  { inbound: 'thinking', expression: 'thinking.json' },
  { inbound: 'responding', expression: 'responding.json' },
  { inbound: 'error', expression: 'error.json' },
  { inbound: 'idle', expression: 'idle.json' },
] as const;

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

function inbound(state: string): StateInboundEvent {
  return {
    protocol_version: '1.0',
    ts: Date.now(),
    surface: 'cursor',
    state,
    metadata: {},
  };
}

describe('full loop integration', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let tempEngramsDir: string | null = null;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
    if (tempEngramsDir) {
      await rm(tempEngramsDir, { recursive: true, force: true });
      tempEngramsDir = null;
    }
  });

  // awaken: bind Engram and broadcast idle so Shrine + hooks can drive expressions.
  it('awaken broadcasts idle with fixture engram_id', async () => {
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const session = new SessionState();
    const stateSocket = createStateSocketServer(session, { port: 0 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
    });
    const handlers = createToolHandlers(config, session, stateSocket);

    const overlay = await connectClient(address.port);
    const firstBroadcast = collectLines(overlay, 1);

    const result = await handlers.awaken(FIXTURE_ENGRAM_ID);
    expect(result.ok).toBe(true);

    const [line] = await firstBroadcast;
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(broadcast.engram_id).toBe(FIXTURE_ENGRAM_ID);
    expect(broadcast.state).toBe('idle');
    expect(broadcast.expression).toBe('idle.json');

    overlay.destroy();
  });

  it('cursor lifecycle states map to fixture engram vessel clips after load', async () => {
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const session = new SessionState();
    const stateSocket = createStateSocketServer(session, { port: 0 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
    });
    const handlers = createToolHandlers(config, session, stateSocket);

    await handlers.awaken(FIXTURE_ENGRAM_ID);

    const overlay = await connectClient(address.port);
    const producer = await connectClient(address.port);

    // Drain awaken idle broadcast from buffer replay on connect.
    await collectLines(overlay, 1);

    for (const { inbound: state, expression } of CURSOR_LIFECYCLE_STATES) {
      const next = collectLines(overlay, 1);
      producer.write(`${JSON.stringify(inbound(state))}\n`);

      const [line] = await next;
      const broadcast = JSON.parse(line) as StateBroadcast;

      expect(broadcast.engram_id).toBe(FIXTURE_ENGRAM_ID);
      expect(broadcast.state).toBe(state);
      expect(broadcast.expression).toBe(expression);
    }

    overlay.destroy();
    producer.destroy();
  });
});
