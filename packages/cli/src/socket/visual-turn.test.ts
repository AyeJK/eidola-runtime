import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionState } from '../session/state.js';
import { createStateSocketServer } from './server.js';
import type { StateBroadcast, StateInboundEvent } from './types.js';
import { VisualTurnTracker } from './visual-turn.js';

/**
 * Phase 5.3.2 — tool-adjacent thinking grace period. These tests cover both
 * the bare `VisualTurnTracker` timer mechanism and the end-to-end broadcaster
 * behavior wired through `createStateSocketServer` (the actual surface the
 * acceptance criteria describe). `claude-code` and `cursor` are exercised
 * identically — the override has no per-surface branching by design.
 */

async function writeFixtureEngram(engramDir: string): Promise<void> {
  await mkdir(engramDir, { recursive: true });
  await writeFile(
    join(engramDir, 'SOUL.md'),
    '# Fixture Engram\n\nA test fixture persona for grace-timer tests.\n',
    'utf8',
  );
  await writeFile(
    join(engramDir, 'vessel.yaml'),
    [
      'type: lottie',
      'pack: fixture-pack',
      'expressions:',
      '  idle: idle.json',
      '  thinking: thinking.json',
      '  waiting: waiting.json',
      '  responding: responding.json',
      '  working: working.json',
      '  searching: working.json',
      '  writing: working.json',
      '  success: responding.json',
      '  error: error.json',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      'id: fixture-engram',
      'name: Fixture Engram',
      'voice_id: null',
      'meta:',
      '  author: test',
      '  created: "2026-06-22"',
      'extensions: {}',
    ].join('\n'),
    'utf8',
  );
}

async function loadFixtureEngram(session: SessionState): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-grace-fixture-'));
  const engramDir = join(tempRoot, 'fixture-engram');
  await writeFixtureEngram(engramDir);
  await session.load(engramDir);
}

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

function inbound(overrides: Partial<StateInboundEvent> = {}): StateInboundEvent {
  return {
    protocol_version: '1.0',
    ts: Date.now(),
    surface: 'cursor',
    state: 'thinking',
    metadata: {},
    ...overrides,
  };
}

describe('VisualTurnTracker grace timer (unit)', () => {
  it('arms a timer that fires onElapse if nothing cancels it', () => {
    vi.useFakeTimers();
    const tracker = new VisualTurnTracker();
    const onElapse = vi.fn();

    tracker.armGraceTimer(4_500, onElapse);
    expect(tracker.hasArmedGraceTimer()).toBe(true);
    expect(onElapse).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4_500);
    expect(onElapse).toHaveBeenCalledTimes(1);
    expect(tracker.hasArmedGraceTimer()).toBe(false);

    vi.useRealTimers();
  });

  it('clearGraceTimer cancels an armed timer with no flip', () => {
    vi.useFakeTimers();
    const tracker = new VisualTurnTracker();
    const onElapse = vi.fn();

    tracker.armGraceTimer(4_500, onElapse);
    tracker.clearGraceTimer();
    vi.advanceTimersByTime(10_000);

    expect(onElapse).not.toHaveBeenCalled();
    expect(tracker.hasArmedGraceTimer()).toBe(false);

    vi.useRealTimers();
  });

  it('a new tool-cluster update() cancels a pending grace timer', () => {
    vi.useFakeTimers();
    const tracker = new VisualTurnTracker();
    const onElapse = vi.fn();

    tracker.armGraceTimer(4_500, onElapse);
    tracker.update('working');
    vi.advanceTimersByTime(10_000);

    expect(onElapse).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('reset() clears the armed timer and firstToolStarted', () => {
    vi.useFakeTimers();
    const tracker = new VisualTurnTracker();
    const onElapse = vi.fn();

    tracker.update('working');
    expect(tracker.getFirstToolStarted()).toBe(true);

    tracker.armGraceTimer(4_500, onElapse);
    tracker.reset();

    expect(tracker.hasArmedGraceTimer()).toBe(false);
    expect(tracker.getFirstToolStarted()).toBe(false);

    vi.advanceTimersByTime(10_000);
    expect(onElapse).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('idle/success/error via update() clears an armed timer', () => {
    vi.useFakeTimers();
    for (const terminal of ['idle', 'success', 'error']) {
      const tracker = new VisualTurnTracker();
      const onElapse = vi.fn();

      tracker.update('working');
      tracker.armGraceTimer(4_500, onElapse);
      tracker.update(terminal);

      expect(tracker.hasArmedGraceTimer()).toBe(false);
      vi.advanceTimersByTime(10_000);
      expect(onElapse).not.toHaveBeenCalled();
    }
    vi.useRealTimers();
  });
});

describe('tool-adjacent thinking grace period (end-to-end via state socket)', () => {
  let closeServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
    vi.useRealTimers();
  });

  // A short real grace window (not faked timers) — fake timers don't
  // reliably interleave with real socket I/O across processes/event-loop
  // turns, so these end-to-end tests use a tiny real `thinkingGraceMs`
  // instead, exercised through the public `StateSocketConfig` option.
  const TEST_GRACE_MS = 40;

  for (const surface of ['claude-code', 'cursor'] as const) {
    it(`thinking immediately after a tool stays visually waiting until the grace timer elapses (${surface})`, async () => {
      const session = new SessionState();
      await loadFixtureEngram(session);

      const stateSocket = createStateSocketServer(session, {
        port: 0,
        bufferSize: 8,
        thinkingGraceMs: TEST_GRACE_MS,
      });
      const address = await stateSocket.start();
      closeServer = () => stateSocket.close();

      const client = await connectClient(address.port);

      const firstLine = collectLines(client, 1);
      client.write(
        `${JSON.stringify(
          inbound({ surface, state: 'searching', tool: 'Grep', metadata: { first_tool_started: true } }),
        )}\n`,
      );
      await firstLine;

      const secondLine = collectLines(client, 1);
      client.write(
        `${JSON.stringify(
          inbound({ surface, state: 'thinking', tool: 'Grep', metadata: { first_tool_started: true } }),
        )}\n`,
      );
      const [postToolLine] = await secondLine;
      const postToolBroadcast = JSON.parse(postToolLine) as StateBroadcast;

      expect(postToolBroadcast.state).toBe('thinking');
      expect(postToolBroadcast.visual_state).toBe('waiting');

      // Nothing else arrives — waiting past the grace window should flip
      // the same turn's visual to genuine thinking without a new inbound event.
      const flipLine = collectLines(client, 1, 2000);
      const [flippedRaw] = await flipLine;
      const flipped = JSON.parse(flippedRaw) as StateBroadcast;

      expect(flipped.state).toBe('thinking');
      expect(flipped.visual_state).toBeUndefined();
      expect(flipped.expression).toBe('thinking.json');

      client.destroy();
    });
  }

  it('a follow-up tool-aware event cancels the pending flip', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, {
      port: 0,
      bufferSize: 8,
      thinkingGraceMs: TEST_GRACE_MS,
    });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);

    const firstLine = collectLines(client, 1);
    client.write(
      `${JSON.stringify(
        inbound({ state: 'searching', tool: 'Grep', metadata: { first_tool_started: true } }),
      )}\n`,
    );
    await firstLine;

    const secondLine = collectLines(client, 1);
    client.write(
      `${JSON.stringify(
        inbound({ state: 'thinking', tool: 'Grep', metadata: { first_tool_started: true } }),
      )}\n`,
    );
    await secondLine;

    // A new tool-aware broadcast arrives inside the grace window.
    const thirdLine = collectLines(client, 1);
    client.write(
      `${JSON.stringify(
        inbound({ state: 'writing', tool: 'Write', metadata: { first_tool_started: true } }),
      )}\n`,
    );
    await thirdLine;

    // Waiting well past the original grace window must NOT produce a stray
    // flip broadcast — the pending timer was cancelled.
    let sawExtra = false;
    const onExtra = () => {
      sawExtra = true;
    };
    client.on('data', onExtra);
    await new Promise((resolve) => setTimeout(resolve, TEST_GRACE_MS * 5));
    client.off('data', onExtra);

    expect(sawExtra).toBe(false);

    client.destroy();
  });

  it('idle/success/error clears all tracker state including any armed timer', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, {
      port: 0,
      bufferSize: 8,
      thinkingGraceMs: TEST_GRACE_MS,
    });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);

    const firstLine = collectLines(client, 1);
    client.write(
      `${JSON.stringify(
        inbound({ state: 'searching', tool: 'Grep', metadata: { first_tool_started: true } }),
      )}\n`,
    );
    await firstLine;

    const secondLine = collectLines(client, 1);
    client.write(
      `${JSON.stringify(
        inbound({ state: 'thinking', tool: 'Grep', metadata: { first_tool_started: true } }),
      )}\n`,
    );
    await secondLine;

    const terminalLine = collectLines(client, 1);
    client.write(`${JSON.stringify(inbound({ state: 'success' }))}\n`);
    await terminalLine;

    let sawExtra = false;
    const onExtra = () => {
      sawExtra = true;
    };
    client.on('data', onExtra);
    await new Promise((resolve) => setTimeout(resolve, TEST_GRACE_MS * 5));
    client.off('data', onExtra);

    expect(sawExtra).toBe(false);

    client.destroy();
  });

  it('sustained pure-reasoning turns (no tool calls) show thinking immediately, no grace delay', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);

    const line = collectLines(client, 1);
    client.write(`${JSON.stringify(inbound({ state: 'thinking' }))}\n`);
    const [raw] = await line;
    const broadcast = JSON.parse(raw) as StateBroadcast;

    expect(broadcast.state).toBe('thinking');
    expect(broadcast.visual_state).toBeUndefined();
    expect(broadcast.expression).toBe('thinking.json');

    client.destroy();
  });
});
