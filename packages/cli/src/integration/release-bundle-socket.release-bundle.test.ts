import { connect, type Socket } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VesselResolver } from '../../../shrine/src/shared/vessel-resolver.js';
import { resolveEidolaRuntimeConfig } from '../config.js';
import { resolveEngramLocation } from '../engram/registry.js';
import { SessionState } from '../session/state.js';
import { createStateSocketServer } from '../socket/server.js';
import type { StateBroadcast } from '../socket/types.js';
import { createToolHandlers } from '../tools/handlers.js';
import {
  hasPonytailReleaseBundle,
  PONYTAIL_BUNDLE_DIR,
  requirePonytailReleaseBundle,
} from './release-bundle-fixture.js';

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

describe.skipIf(!hasPonytailReleaseBundle())('release-bundle: MCP socket + Shrine syncEngram', () => {
  let closeServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  it('broadcasts idle and syncEngram resolves nested release path without missing clip', async () => {
    const fixture = await requirePonytailReleaseBundle();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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

    const result = await handlers.awaken(fixture.engramId);
    expect(result.ok).toBe(true);

    const [line] = await firstBroadcast;
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(broadcast.engram_id).toBe(fixture.engramId);
    expect(broadcast.state).toBe('idle');
    expect(broadcast.expression).toBe('idle.mp4');

    const located = await resolveEngramLocation(fixture.engramsDir, fixture.engramId);
    expect(located.directory).toBe(fixture.engramDir);
    expect(located.directory).toContain(PONYTAIL_BUNDLE_DIR);
    expect(located.vesselsDir).toBe(fixture.vesselsDir);

    const resolver = new VesselResolver({
      engramsDir: fixture.engramsDir,
      vesselsDir: fixture.vesselsDir,
      folderConfigured: true,
      catalogIds: new Set([fixture.engramId]),
    });

    const payload = await resolver.buildStatePayload(broadcast);
    expect(payload).not.toBeNull();
    expect(payload?.clipUrl).toContain('idle.mp4');
    expect(payload?.clipUrl).toContain('ponytail-engram-vessel');

    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('missing clip'),
    );

    overlay.destroy();
  });
});
