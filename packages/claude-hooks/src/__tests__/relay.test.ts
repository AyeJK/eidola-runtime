import { describe, expect, it, afterEach } from 'vitest';
import { createServer, type Server } from 'node:net';
import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runRelay } from '../relay.js';
import { buildStatePayload, serializeStatePayload } from '../payload.js';
import { sendStateToSocket } from '../socket.js';

function listenAndRelay(hookName: string, payload: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((socket) => {
      socket.once('data', (chunk) => {
        resolve(chunk.toString('utf8'));
        socket.end();
      });
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected TCP port'));
        return;
      }

      process.env.EIDOLA_STATE_SOCKET_PORT = String(address.port);
      await runRelay(hookName, JSON.stringify(payload));
      delete process.env.EIDOLA_STATE_SOCKET_PORT;
      server.close();
    });
  });
}

describe('buildStatePayload', () => {
  it('writes protocol_version 1.0 and surface claude-code', () => {
    const payload = buildStatePayload('thinking', { ts: 1_749_600_000_000 });

    expect(payload).toEqual({
      protocol_version: '1.0',
      ts: 1_749_600_000_000,
      surface: 'claude-code',
      state: 'thinking',
    });
  });

  it('serializes newline-delimited JSON', () => {
    const line = serializeStatePayload(
      buildStatePayload('searching', { ts: 1_749_600_000_000, tool: 'Grep' }),
    );

    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line.trim())).toMatchObject({
      protocol_version: '1.0',
      surface: 'claude-code',
      state: 'searching',
      tool: 'Grep',
    });
  });
});

describe('sendStateToSocket', () => {
  it('resolves silently when socket is unavailable', async () => {
    await expect(
      sendStateToSocket({ state: 'idle' }, { host: '127.0.0.1', port: 1, ts: 1_749_600_000_000 }),
    ).resolves.toBeUndefined();
  });
});

describe('runRelay', () => {
  it('relays mapped hook events to the socket with surface claude-code', async () => {
    const received = await new Promise<string>((resolve, reject) => {
      const server: Server = createServer((socket) => {
        socket.once('data', (chunk) => {
          resolve(chunk.toString('utf8'));
          socket.end();
        });
      });

      server.once('error', reject);
      server.listen(0, '127.0.0.1', async () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Expected TCP port'));
          return;
        }

        process.env.EIDOLA_STATE_SOCKET_PORT = String(address.port);
        await runRelay('UserPromptSubmit', '{}');
        delete process.env.EIDOLA_STATE_SOCKET_PORT;
        server.close();
      });
    });

    expect(JSON.parse(received.trim())).toMatchObject({
      protocol_version: '1.0',
      surface: 'claude-code',
      state: 'thinking',
    });
  });

  it('relays tool-aware PreToolUse states', async () => {
    const received = await new Promise<string>((resolve, reject) => {
      const server: Server = createServer((socket) => {
        socket.once('data', (chunk) => {
          resolve(chunk.toString('utf8'));
          socket.end();
        });
      });

      server.once('error', reject);
      server.listen(0, '127.0.0.1', async () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Expected TCP port'));
          return;
        }

        process.env.EIDOLA_STATE_SOCKET_PORT = String(address.port);
        await runRelay('PreToolUse', JSON.stringify({ tool_name: 'Grep' }));
        delete process.env.EIDOLA_STATE_SOCKET_PORT;
        server.close();
      });
    });

    expect(JSON.parse(received.trim())).toMatchObject({
      protocol_version: '1.0',
      surface: 'claude-code',
      state: 'searching',
      tool: 'Grep',
    });
  });

  it('does not throw or hang when no listener is present on the socket', async () => {
    process.env.EIDOLA_STATE_SOCKET_PORT = '1';
    await expect(runRelay('Stop', '{}')).resolves.toBeUndefined();
    delete process.env.EIDOLA_STATE_SOCKET_PORT;
  });

  it('exits cleanly (no mapping emitted) for unknown hook names', async () => {
    await expect(runRelay('TotallyUnknownHook', '{}')).resolves.toBeUndefined();
  });

  describe('Stop turn tracking', () => {
    const sessionId = 'relay-test-session';

    afterEach(async () => {
      await rm(join(homedir(), '.eidola', 'turns', `${sessionId}.json`), { force: true });
    });

    it('maps Stop to responding when no tool ran since UserPromptSubmit', async () => {
      await listenAndRelay('UserPromptSubmit', { session_id: sessionId });
      const received = await listenAndRelay('Stop', { session_id: sessionId });

      expect(JSON.parse(received.trim())).toMatchObject({ state: 'responding' });
    });

    it('maps Stop to success when a tool ran since UserPromptSubmit', async () => {
      await listenAndRelay('UserPromptSubmit', { session_id: sessionId });
      await listenAndRelay('PreToolUse', { session_id: sessionId, tool_name: 'Bash' });
      const received = await listenAndRelay('Stop', { session_id: sessionId });

      expect(JSON.parse(received.trim())).toMatchObject({ state: 'success' });
    });

    it('still maps Stop to error/idle regardless of tool usage', async () => {
      await listenAndRelay('UserPromptSubmit', { session_id: sessionId });

      const errorReceived = await listenAndRelay('Stop', { session_id: sessionId, status: 'error' });
      expect(JSON.parse(errorReceived.trim())).toMatchObject({ state: 'error' });

      await listenAndRelay('UserPromptSubmit', { session_id: sessionId });
      const idleReceived = await listenAndRelay('Stop', {
        session_id: sessionId,
        stop_hook_active: true,
      });
      expect(JSON.parse(idleReceived.trim())).toMatchObject({ state: 'idle' });
    });
  });
});
