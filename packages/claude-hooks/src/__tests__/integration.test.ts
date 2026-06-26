import { createServer, type Server } from 'node:net';
import { describe, expect, it, afterEach } from 'vitest';
import { isWorkingClusterState, resolveVisualState } from '@eidola/tool-state';
import { runRelay } from '../relay.js';
import type { StateInboundPayload } from '../types.js';

/**
 * Sprint 5.2 Task 4 — integration test.
 *
 * Simulates a realistic Claude Code hook timeline (PreToolUse Bash, Read,
 * Write; PostToolUse success/fail; Stop) going through the full
 * stdin -> runRelay -> mapHookToState -> sendStateToSocket pipeline, and
 * asserts the correct vessel state arrives at a listening TCP socket — the
 * same NDJSON protocol packages/mcp's state socket server (and, downstream,
 * Shrine's StateSocketClient) consumes. This package doesn't depend on
 * @eidola/mcp, so the test stands in a raw TCP listener as the "Shrine SSE
 * endpoint" referenced in the sprint brief; packages/mcp/src/socket/roundtrip.test.ts
 * and full-loop.test.ts cover the next hop (socket -> broadcast -> expression).
 */

function listenOnEphemeralPort(): Promise<{ server: Server; port: number }> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected TCP port'));
        return;
      }
      resolvePromise({ server, port: address.port });
    });
  });
}

function collectNextLine(server: Server, timeoutMs = 2000): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for inbound line'));
    }, timeoutMs);

    server.once('connection', (socket) => {
      socket.once('data', (chunk) => {
        clearTimeout(timer);
        resolvePromise(chunk.toString('utf8').trim());
        socket.end();
      });
    });
  });
}

describe('claude-hooks integration: 5 simulated payloads -> 5 correct states', () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
      server = null;
    }
    delete process.env.EIDOLA_STATE_SOCKET_PORT;
  });

  const cases: Array<{
    hook: string;
    payload: Record<string, unknown>;
    expectedState: string;
    expectedTool?: string;
  }> = [
    {
      hook: 'PreToolUse',
      payload: { tool_name: 'Bash', tool_input: { command: 'pnpm test' } },
      expectedState: 'working',
      expectedTool: 'Bash',
    },
    {
      hook: 'PreToolUse',
      payload: { tool_name: 'Read', tool_input: { file_path: 'src/map.ts' } },
      expectedState: 'searching',
      expectedTool: 'Read',
    },
    {
      hook: 'PreToolUse',
      payload: { tool_name: 'Write', tool_input: { file_path: 'src/new-file.ts' } },
      expectedState: 'writing',
      expectedTool: 'Write',
    },
    {
      hook: 'PostToolUse',
      payload: { tool_name: 'Bash', tool_response: { ok: true } },
      expectedState: 'thinking',
      expectedTool: 'Bash',
    },
    {
      hook: 'PostToolUse',
      payload: { tool_name: 'Bash', tool_response: { error: 'exit code 1' } },
      expectedState: 'error',
      expectedTool: 'Bash',
    },
  ];

  it('relays each simulated hook payload to the correct vessel state over the socket', async () => {
    for (const { hook, payload, expectedState, expectedTool } of cases) {
      const listener = await listenOnEphemeralPort();
      server = listener.server;
      process.env.EIDOLA_STATE_SOCKET_PORT = String(listener.port);

      const nextLine = collectNextLine(listener.server);
      await runRelay(hook, JSON.stringify(payload));
      const raw = await nextLine;
      const received = JSON.parse(raw) as StateInboundPayload;

      expect(received.protocol_version).toBe('1.0');
      expect(received.surface).toBe('claude-code');
      expect(received.state).toBe(expectedState);
      if (expectedTool !== undefined) {
        expect(received.tool).toBe(expectedTool);
      }

      await new Promise<void>((resolveClose) => listener.server.close(() => resolveClose()));
      server = null;
    }
  });

  it('confirms the Stop hook completes the timeline with a defined terminal state', async () => {
    const listener = await listenOnEphemeralPort();
    server = listener.server;
    process.env.EIDOLA_STATE_SOCKET_PORT = String(listener.port);

    const nextLine = collectNextLine(listener.server);
    await runRelay('Stop', JSON.stringify({}));
    const raw = await nextLine;
    const received = JSON.parse(raw) as StateInboundPayload;

    expect(received.state).toBe('success');
  });

  it('overlapping tool calls: A starts, B starts, A finishes -> tools_in_flight 1, B finishes -> tools_in_flight 0', async () => {
    const listener = await listenOnEphemeralPort();
    server = listener.server;
    process.env.EIDOLA_STATE_SOCKET_PORT = String(listener.port);

    const sessionId = `overlap-${Date.now()}`;

    // A starts (PreToolUse), B starts (PreToolUse) — no decrements yet.
    let nextLine = collectNextLine(listener.server);
    await runRelay(
      'PreToolUse',
      JSON.stringify({ session_id: sessionId, tool_name: 'Bash', tool_input: { command: 'sleep 5' } }),
    );
    await nextLine;

    nextLine = collectNextLine(listener.server);
    await runRelay(
      'PreToolUse',
      JSON.stringify({ session_id: sessionId, tool_name: 'Grep', tool_input: { pattern: 'foo' } }),
    );
    await nextLine;

    // A finishes first — a sibling (B) is still in flight.
    nextLine = collectNextLine(listener.server);
    await runRelay(
      'PostToolUse',
      JSON.stringify({ session_id: sessionId, tool_name: 'Bash', tool_response: { ok: true } }),
    );
    const aFinishedRaw = await nextLine;
    const aFinished = JSON.parse(aFinishedRaw) as StateInboundPayload;
    expect(aFinished.state).toBe('thinking');
    expect(aFinished.metadata?.tools_in_flight).toBe(1);

    // B finishes — nothing left in flight.
    nextLine = collectNextLine(listener.server);
    await runRelay(
      'PostToolUse',
      JSON.stringify({ session_id: sessionId, tool_name: 'Grep', tool_response: { ok: true } }),
    );
    const bFinishedRaw = await nextLine;
    const bFinished = JSON.parse(bFinishedRaw) as StateInboundPayload;
    expect(bFinished.state).toBe('thinking');
    expect(bFinished.metadata?.tools_in_flight).toBe(0);
  });

  it('confirms the full tool-running sequence stays inside WORKING_CLUSTER until Stop, matching the Shrine dead-air expectation', () => {
    // This mirrors what packages/shrine's state-socket-client + renderer do:
    // hold the last broadcast visual tier until a new broadcast arrives.
    // There is no client-side idle timeout, so as long as every tool-phase
    // hook maps to a WORKING_CLUSTER member, Shrine continues showing
    // a working-cluster tier for the whole tool run, never reverting to
    // idle on its own. `thinking` resolves to its own visual tier rather
    // than collapsing into `working`.
    const toolWorkingStates = ['working', 'searching', 'writing'];
    for (const state of toolWorkingStates) {
      expect(isWorkingClusterState(state)).toBe(true);
      expect(resolveVisualState({ state, firstToolStarted: true })).toBe('working');
    }
    expect(isWorkingClusterState('thinking')).toBe(true);
    expect(resolveVisualState({ state: 'thinking', firstToolStarted: true })).toBe('thinking');
  });
});
