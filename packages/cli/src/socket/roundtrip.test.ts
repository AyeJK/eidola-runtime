import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionState } from '../session/state.js';
import type { StateBroadcast, StateInboundEvent } from './types.js';
import { createStateSocketServer } from './server.js';

async function writeFixtureEngram(engramDir: string): Promise<void> {
  await mkdir(engramDir, { recursive: true });
  await writeFile(
    join(engramDir, 'SOUL.md'),
    '# Fixture Engram\n\nA test fixture persona for socket round-trip tests.\n',
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
      '  responding: responding.json',
      '  working: working.json',
      '  searching: working.json',
      '  writing: working.json',
      '  success: responding.json',
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
  const tempRoot = await mkdtemp(join(tmpdir(), 'eidola-roundtrip-fixture-'));
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

describe('state socket round-trip', () => {
  let closeServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  it('sends thinking event and receives broadcast with expression field', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const subscriber = await connectClient(address.port);
    const producer = await connectClient(address.port);

    const replayPromise = collectLines(subscriber, 1);
    const inboundLine = `${JSON.stringify(inbound())}\n`;
    producer.write(inboundLine);

    const [line] = await replayPromise;
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(broadcast.protocol_version).toBe('1.0');
    expect(broadcast.state).toBe('thinking');
    expect(broadcast.engram_id).toBe('fixture-engram');
    expect(broadcast.expression).toBe('thinking.json');
    expect(typeof broadcast.ts).toBe('number');

    subscriber.destroy();
    producer.destroy();
  });

  it('binds to 127.0.0.1 only', async () => {
    const session = new SessionState();
    const stateSocket = createStateSocketServer(session, { port: 0 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    expect(address.host).toBe('127.0.0.1');
  });

  it('replays buffered broadcasts when overlay reconnects', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 4 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const producer = await connectClient(address.port);
    producer.write(`${JSON.stringify(inbound({ state: 'thinking' }))}\n`);
    producer.write(`${JSON.stringify(inbound({ state: 'responding' }))}\n`);

    await collectLines(producer, 2);
    producer.destroy();

    const overlay = await connectClient(address.port);
    const replay = await collectLines(overlay, 2, 3000);
    const states = replay.map((line) => (JSON.parse(line) as StateBroadcast).state);

    expect(states).toEqual(['thinking', 'responding']);
    overlay.destroy();
  });

  it('broadcasts success for legacy completed inbound (not idle fallback)', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    client.write(`${JSON.stringify(inbound({ state: 'completed' }))}\n`);

    const [line] = await collectLines(client, 1);
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(broadcast.state).toBe('success');
    expect(broadcast.expression).toBe('responding.json');

    client.destroy();
  });

  it('falls back unknown states to idle without throwing', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const warnings: string[] = [];
    const stateSocket = createStateSocketServer(session, {
      port: 0,
      onWarn: (message) => warnings.push(message),
    });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    client.write(`${JSON.stringify(inbound({ state: 'not-a-real-state' }))}\n`);

    const [line] = await collectLines(client, 1);
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(broadcast.state).toBe('idle');
    expect(broadcast.expression).toBe('idle.json');
    expect(warnings.some((message) => message.includes('unknown state'))).toBe(true);

    client.destroy();
  });

  it('falls back to idle on protocol_version mismatch with warning', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const warnings: string[] = [];
    const stateSocket = createStateSocketServer(session, {
      port: 0,
      onWarn: (message) => warnings.push(message),
    });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    client.write(
      `${JSON.stringify(inbound({ protocol_version: '9.9', state: 'searching' }))}\n`,
    );

    const [line] = await collectLines(client, 1);
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(broadcast.state).toBe('idle');
    expect(broadcast.expression).toBe('idle.json');
    expect(warnings.some((message) => message.includes('protocol_version mismatch'))).toBe(true);

    client.destroy();
  });

  it('refines generic working + tool to searching before broadcast', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    client.write(`${JSON.stringify(inbound({ state: 'working', tool: 'Grep' }))}\n`);

    const [line] = await collectLines(client, 1);
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(broadcast.state).toBe('searching');
    expect(broadcast.visual_state).toBe('working');
    expect(broadcast.expression).toBe('working.json');

    client.destroy();
  });

  it('refines generic working + write tool to writing before broadcast', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    client.write(`${JSON.stringify(inbound({ state: 'working', tool: 'Write' }))}\n`);

    const [line] = await collectLines(client, 1);
    const broadcast = JSON.parse(line) as StateBroadcast;

    expect(broadcast.state).toBe('writing');
    expect(broadcast.visual_state).toBe('working');
    expect(broadcast.expression).toBe('working.json');

    client.destroy();
  });

  // Updated for Phase 5.3.2: pre-tool thinking (no tool ran yet this turn)
  // still carries no visual_state override. Tool-driving states still emit
  // visual working. Post-tool thinking now goes through the grace-period
  // override (visual `waiting`, not immediate `thinking`) — see the
  // dedicated grace-period coverage in visual-turn.test.ts for the timer
  // behavior itself; this test only re-confirms the non-grace cases.
  it('pre-tool thinking carries no visual_state override; tool-driving states emit visual working', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    client.write(`${JSON.stringify(inbound({ state: 'thinking' }))}\n`);
    client.write(
      `${JSON.stringify(
        inbound({
          state: 'searching',
          tool: 'Grep',
          metadata: { first_tool_started: true },
        }),
      )}\n`,
    );

    const lines = await collectLines(client, 2);
    const broadcasts = lines.map((line) => JSON.parse(line) as StateBroadcast);

    expect(broadcasts[0]?.state).toBe('thinking');
    expect(broadcasts[0]?.visual_state).toBeUndefined();
    expect(broadcasts[1]?.state).toBe('searching');
    expect(broadcasts[1]?.visual_state).toBe('working');
    expect(broadcasts[1]?.expression).toBe('working.json');

    client.destroy();
  });

  it('post-tool thinking shows the grace-period waiting tier, not immediate thinking', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    client.write(
      `${JSON.stringify(
        inbound({
          state: 'searching',
          tool: 'Grep',
          metadata: { first_tool_started: true },
        }),
      )}\n`,
    );
    client.write(
      `${JSON.stringify(
        inbound({
          state: 'thinking',
          tool: 'Grep',
          metadata: { first_tool_started: true },
        }),
      )}\n`,
    );

    const lines = await collectLines(client, 2);
    const broadcasts = lines.map((line) => JSON.parse(line) as StateBroadcast);

    expect(broadcasts[1]?.state).toBe('thinking');
    expect(broadcasts[1]?.visual_state).toBe('waiting');

    client.destroy();
  });

  // Sprint 5.2 Task 5 — cursor-ext + claude-hooks coexistence.
  // Both producers connect to the same socket independently and write their
  // own NDJSON line; the server has no merge/lock logic between producers —
  // each inbound line is processed and broadcast in the order it's received.
  // This proves "last write wins" (per Phase 5 risk mitigation table) is the
  // actual server behavior, not just an assumption: two simultaneous
  // producers (e.g. cursor-ext extension + claude-hooks relay both active)
  // never corrupt or merge state — whichever line lands last on the socket
  // determines the next broadcast, with no race beyond plain ordering.
  it('two simultaneous producers (e.g. cursor-ext + claude-hooks) do not conflict; last write wins in arrival order', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const overlay = await connectClient(address.port);
    const cursorExtProducer = await connectClient(address.port);
    const claudeHooksProducer = await connectClient(address.port);

    const firstBroadcast = collectLines(overlay, 1);
    cursorExtProducer.write(
      `${JSON.stringify(inbound({ surface: 'cursor', state: 'searching', tool: 'Grep' }))}\n`,
    );
    const [firstLine] = await firstBroadcast;
    const first = JSON.parse(firstLine) as StateBroadcast;
    expect(first.state).toBe('searching');

    const secondBroadcast = collectLines(overlay, 1);
    claudeHooksProducer.write(
      `${JSON.stringify(inbound({ surface: 'claude-code', state: 'writing', tool: 'Write' }))}\n`,
    );
    const [secondLine] = await secondBroadcast;
    const second = JSON.parse(secondLine) as StateBroadcast;

    // The later-arriving write (claude-hooks) wins — no merge with the
    // earlier cursor-ext broadcast, no corruption, no dropped client.
    expect(second.state).toBe('writing');
    expect(second.visual_state).toBe('working');

    overlay.destroy();
    cursorExtProducer.destroy();
    claudeHooksProducer.destroy();
  });

  it('does not re-broadcast a byte-identical repeat of the last state (e.g. two PostToolUse calls in a row)', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    const firstLines = collectLines(client, 1);
    client.write(`${JSON.stringify(inbound({ state: 'thinking', tool: 'Read' }))}\n`);
    await firstLines;

    // Identical state + tool — must not produce a second wire broadcast.
    client.write(`${JSON.stringify(inbound({ state: 'thinking', tool: 'Read' }))}\n`);

    // A genuinely new state confirms the connection is still alive and
    // processing — if the duplicate above had been queued instead of
    // dropped, it would arrive as an extra line before this one.
    const nextLines = collectLines(client, 1);
    client.write(`${JSON.stringify(inbound({ state: 'responding' }))}\n`);
    const [nextLine] = await nextLines;
    expect((JSON.parse(nextLine) as StateBroadcast).state).toBe('responding');

    expect(stateSocket.getBuffer().map((b) => b.state)).toEqual(['thinking', 'responding']);

    client.destroy();
  });

  it('still re-broadcasts the same state when the tool changes (HUD label must update)', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);
    client.write(`${JSON.stringify(inbound({ state: 'thinking', tool: 'Read' }))}\n`);
    client.write(`${JSON.stringify(inbound({ state: 'thinking', tool: 'Grep' }))}\n`);

    const lines = await collectLines(client, 2);
    const broadcasts = lines.map((line) => JSON.parse(line) as StateBroadcast);

    expect(broadcasts[0]?.tool).toBe('Read');
    expect(broadcasts[1]?.tool).toBe('Grep');

    client.destroy();
  });

  // Sprint 5.3.3 — in-flight tool counter. An inbound `'thinking'` event
  // carrying `metadata.tools_in_flight > 0` means a sibling tool is still
  // actually executing even though this one just finished — the broadcast
  // must hold the last busy visual tier instead of falling through to
  // `'thinking'`/`'waiting'`.
  it('suppresses thinking fall-through and holds the last busy tier when tools_in_flight > 0', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, { port: 0, bufferSize: 8 });
    const address = await stateSocket.start();
    closeServer = () => stateSocket.close();

    const client = await connectClient(address.port);

    // Tool A starts (busy tier: searching, visual: working).
    const firstLine = collectLines(client, 1);
    client.write(
      `${JSON.stringify(
        inbound({ state: 'searching', tool: 'Grep', metadata: { first_tool_started: true } }),
      )}\n`,
    );
    const [searchingRaw] = await firstLine;
    expect((JSON.parse(searchingRaw) as StateBroadcast).visual_state).toBe('working');

    // Tool A finishes -> PostToolUse maps to thinking, but tool B is still
    // in flight. The broadcast must hold 'working', not fall through to
    // 'thinking'/'waiting'.
    const secondLine = collectLines(client, 1);
    client.write(
      `${JSON.stringify(
        inbound({
          state: 'thinking',
          tool: 'Grep',
          metadata: { first_tool_started: true, tools_in_flight: 1 },
        }),
      )}\n`,
    );
    const [suppressedRaw] = await secondLine;
    const suppressed = JSON.parse(suppressedRaw) as StateBroadcast;

    expect(suppressed.state).toBe('thinking');
    expect(suppressed.visual_state).toBe('working');
    expect(suppressed.expression).toBe('working.json');

    client.destroy();
  });

  it('behaves exactly as before this sprint when tools_in_flight is 0 or absent', async () => {
    const session = new SessionState();
    await loadFixtureEngram(session);

    const stateSocket = createStateSocketServer(session, {
      port: 0,
      bufferSize: 8,
      thinkingGraceMs: 30,
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

    // tools_in_flight: 0 explicitly — same as absent, no suppression; the
    // existing grace-period override (visual 'waiting') still applies.
    const secondLine = collectLines(client, 1);
    client.write(
      `${JSON.stringify(
        inbound({
          state: 'thinking',
          tool: 'Grep',
          metadata: { first_tool_started: true, tools_in_flight: 0 },
        }),
      )}\n`,
    );
    const [raw] = await secondLine;
    const broadcast = JSON.parse(raw) as StateBroadcast;

    expect(broadcast.state).toBe('thinking');
    expect(broadcast.visual_state).toBe('waiting');

    client.destroy();
  });
});
