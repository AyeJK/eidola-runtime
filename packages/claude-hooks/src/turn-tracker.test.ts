import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeTurnToolUsage,
  decrementTurnToolInFlight,
  incrementTurnToolInFlight,
  markTurnToolUsed,
  resetTurnToolUsage,
} from './turn-tracker.js';

describe('turn-tracker', () => {
  let configDir: string;

  afterEach(async () => {
    if (configDir) {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('reports tool_used: false for a turn with no tool calls', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));

    await resetTurnToolUsage('session-1', configDir);

    await expect(consumeTurnToolUsage('session-1', configDir)).resolves.toBe(false);
  });

  it('reports tool_used: true once a tool runs during the turn', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));

    await resetTurnToolUsage('session-1', configDir);
    await markTurnToolUsed('session-1', configDir);

    await expect(consumeTurnToolUsage('session-1', configDir)).resolves.toBe(true);
  });

  it('clears the flag after consuming, so a stale read does not leak into the next turn', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));

    await resetTurnToolUsage('session-1', configDir);
    await markTurnToolUsed('session-1', configDir);
    await consumeTurnToolUsage('session-1', configDir);

    await expect(consumeTurnToolUsage('session-1', configDir)).resolves.toBe(true);
  });

  it('defaults to tool_used: true when there is no tracked turn (e.g. unknown session)', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));

    await expect(consumeTurnToolUsage('never-started', configDir)).resolves.toBe(true);
  });

  it('is a no-op and defaults to true when sessionId is undefined', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));

    await resetTurnToolUsage(undefined, configDir);
    await markTurnToolUsed(undefined, configDir);

    await expect(consumeTurnToolUsage(undefined, configDir)).resolves.toBe(true);
  });

  it('keeps separate sessions independent', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));

    await resetTurnToolUsage('session-a', configDir);
    await resetTurnToolUsage('session-b', configDir);
    await markTurnToolUsed('session-b', configDir);

    await expect(consumeTurnToolUsage('session-a', configDir)).resolves.toBe(false);
    await expect(consumeTurnToolUsage('session-b', configDir)).resolves.toBe(true);
  });
});

describe('in-flight tool counter', () => {
  let configDir: string;

  afterEach(async () => {
    if (configDir) {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('increments the in-flight count for each tool start', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));
    await resetTurnToolUsage('session-1', configDir);

    await expect(incrementTurnToolInFlight('session-1', configDir)).resolves.toBe(1);
    await expect(incrementTurnToolInFlight('session-1', configDir)).resolves.toBe(2);
  });

  it('decrements the in-flight count for each tool end', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));
    await resetTurnToolUsage('session-1', configDir);

    await incrementTurnToolInFlight('session-1', configDir);
    await incrementTurnToolInFlight('session-1', configDir);

    await expect(decrementTurnToolInFlight('session-1', configDir)).resolves.toBe(1);
    await expect(decrementTurnToolInFlight('session-1', configDir)).resolves.toBe(0);
  });

  it('floors the in-flight count at 0 — a duplicate or missed decrement cannot go negative', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));
    await resetTurnToolUsage('session-1', configDir);

    await incrementTurnToolInFlight('session-1', configDir);
    await decrementTurnToolInFlight('session-1', configDir);
    await expect(decrementTurnToolInFlight('session-1', configDir)).resolves.toBe(0);
    await expect(decrementTurnToolInFlight('session-1', configDir)).resolves.toBe(0);
  });

  it('persists the in-flight count across simulated fresh-process round-trips', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));
    await resetTurnToolUsage('session-1', configDir);

    // Each call simulates a fresh hook invocation (fresh process), reading
    // and writing the same file rather than sharing in-memory state.
    await incrementTurnToolInFlight('session-1', configDir);
    await incrementTurnToolInFlight('session-1', configDir);
    await expect(decrementTurnToolInFlight('session-1', configDir)).resolves.toBe(1);
  });

  it('a fresh resetTurnToolUsage always zeroes in-flight, regardless of prior state', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));
    await resetTurnToolUsage('session-1', configDir);

    await incrementTurnToolInFlight('session-1', configDir);
    await incrementTurnToolInFlight('session-1', configDir);

    await resetTurnToolUsage('session-1', configDir);

    await expect(decrementTurnToolInFlight('session-1', configDir)).resolves.toBe(0);
  });

  it('is a no-op returning 0 when sessionId is undefined', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));

    await expect(incrementTurnToolInFlight(undefined, configDir)).resolves.toBe(0);
    await expect(decrementTurnToolInFlight(undefined, configDir)).resolves.toBe(0);
  });

  it('marks tool_used true as a side effect of incrementing in-flight', async () => {
    configDir = await mkdtemp(join(tmpdir(), 'eidola-turn-tracker-'));
    await resetTurnToolUsage('session-1', configDir);

    await incrementTurnToolInFlight('session-1', configDir);

    await expect(consumeTurnToolUsage('session-1', configDir)).resolves.toBe(true);
  });
});
