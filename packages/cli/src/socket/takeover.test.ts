import { connect, createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionState } from '../session/state.js';
import { createFixtureEngramsDir, writeFixtureEngram } from '../integration/local-engram-fixture.js';
import type { StateBroadcast } from './types.js';
import { createStateSocketServer, type StateSocketServer } from './server.js';

function connectClient(port: number, host = '127.0.0.1'): Promise<Socket> {
  return new Promise((resolvePromise, reject) => {
    const socket = connect({ port, host }, () => resolvePromise(socket));
    socket.once('error', reject);
  });
}

async function collectLines(socket: Socket, count: number, timeoutMs = 2000): Promise<string[]> {
  const lines: string[] = [];

  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${count} line(s); got ${lines.length}`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      const parts = chunk.toString('utf8').split('\n').filter(Boolean);
      for (const part of parts) {
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

describe('state socket claim/takeover', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      await cleanup?.();
    }
  });

  it('a second instance claims the port from the current owner ("last awakened wins")', async () => {
    const { engramsDir } = await createFixtureEngramsDir('engram-a');
    await writeFixtureEngram(engramsDir, 'engram-b');

    const sessionA = new SessionState();
    await sessionA.load(`${engramsDir}/engram-a`);
    const socketA: StateSocketServer = createStateSocketServer(sessionA, { port: 0 });
    const addressA = await socketA.start();
    cleanups.push(() => socketA.close());
    expect(addressA.listening).toBe(true);

    const sessionB = new SessionState();
    await sessionB.load(`${engramsDir}/engram-b`);
    const socketB: StateSocketServer = createStateSocketServer(sessionB, { port: addressA.port });
    cleanups.push(() => socketB.close());

    // Mirrors what happens today when a second eidola-mcp process starts
    // while another already owns the socket: it can't bind.
    const initialAttempt = await socketB.start();
    expect(initialAttempt.listening).toBe(false);

    // An overlay already connected to A's server — release tears its
    // connection down along with A's; overlays are expected to reconnect,
    // same as they would if A's whole process had exited.
    const staleOverlay = await connectClient(addressA.port);
    const staleClose = new Promise<void>((resolve) => staleOverlay.once('close', resolve));

    const claimed = await socketB.claimOwnership();
    expect(claimed.listening).toBe(true);
    expect(socketA.isListening()).toBe(false);
    expect(socketB.isListening()).toBe(true);
    await staleClose;

    const overlay = await connectClient(addressA.port);
    cleanups.push(async () => {
      overlay.destroy();
    });

    const nextBroadcast = collectLines(overlay, 1);
    socketB.broadcastState({ state: 'idle', surface: 'manual' });
    const [line] = await nextBroadcast;
    const broadcast = JSON.parse(line) as StateBroadcast;

    // The claimant's own session (engram-b) drives the broadcast now — not
    // the previous owner's (engram-a), and not empty.
    expect(broadcast.engram_id).toBe('engram-b');
  });

  it('claimOwnership behaves like start() when nothing currently owns the socket', async () => {
    const { engramsDir } = await createFixtureEngramsDir('engram-solo');
    const session = new SessionState();
    await session.load(`${engramsDir}/engram-solo`);

    const stateSocket = createStateSocketServer(session, { port: 0 });
    cleanups.push(() => stateSocket.close());

    const result = await stateSocket.claimOwnership();
    expect(result.listening).toBe(true);
  });

  it('claiming instance falls back to non-listening in bounded time if the current owner never releases', async () => {
    // Stands in for an owner that ignores claim messages entirely (e.g. a
    // pre-claim-protocol build): a bare TCP listener that accepts the claim
    // connection but never closes it and never frees the port.
    const impostor: Server = createServer((socket) => {
      socket.on('data', () => {
        /* silently absorb the claim message — never releases */
      });
    });
    await new Promise<void>((resolve) => impostor.listen(0, '127.0.0.1', () => resolve()));
    const impostorAddress = impostor.address();
    if (!impostorAddress || typeof impostorAddress !== 'object') {
      throw new Error('impostor server failed to bind');
    }
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          impostor.close(() => resolve());
        }),
    );

    const claimant = createStateSocketServer(new SessionState(), { port: impostorAddress.port });
    cleanups.push(() => claimant.close());

    const start = Date.now();
    const result = await claimant.claimOwnership();
    const elapsedMs = Date.now() - start;

    expect(result.listening).toBe(false);
    // Timeout (500ms) + up to 4 retries (100ms apart) — bounded, not hung.
    expect(elapsedMs).toBeLessThan(2000);
  });
});
