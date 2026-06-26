import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveVisualState } from '@eidola/tool-state';
import { mapHookToState } from './map.js';
import { resolveSocketPort } from './payload.js';

export interface TurnState {
  toolsUsed: boolean;
  firstToolStarted: boolean;
  inTurn: boolean;
  responseDelivered: boolean;
  inFlight: number;
}

const DEFAULT_TURN_STATE: TurnState = {
  toolsUsed: false,
  firstToolStarted: false,
  inTurn: false,
  responseDelivered: false,
  inFlight: 0,
};

/** Hooks that start a tool's execution (in-flight counter increments). */
export const TOOL_START_HOOKS = new Set(['preToolUse', 'subagentStart']);

/** Hooks that end a tool's execution (in-flight counter decrements). */
export const TOOL_END_HOOKS = new Set(['postToolUse', 'subagentStop']);

/** Hooks that imply tool activity this turn (including false-negative guards). */
export const TOOLS_USED_HOOKS = new Set([
  'preToolUse',
  'beforeShellExecution',
  'beforeMCPExecution',
  'postToolUse',
  'postToolUseFailure',
  'subagentStart',
  'afterFileEdit',
  'beforeReadFile',
]);

/** Hooks that lock visual tier to `working` for the remainder of the turn. */
export const FIRST_TOOL_HOOKS = new Set([
  'preToolUse',
  'beforeReadFile',
  'afterFileEdit',
  'subagentStart',
]);

export function getTurnStatePath(): string {
  const port = resolveSocketPort();
  const dir = join(tmpdir(), 'eidola-relay');
  mkdirSync(dir, { recursive: true });
  return join(dir, `turn-${port}.json`);
}

export function readTurnState(): TurnState {
  try {
    const raw = readFileSync(getTurnStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<TurnState>;
    return {
      toolsUsed: parsed.toolsUsed === true,
      firstToolStarted: parsed.firstToolStarted === true,
      inTurn: parsed.inTurn === true,
      responseDelivered: parsed.responseDelivered === true,
      inFlight: typeof parsed.inFlight === 'number' && parsed.inFlight > 0 ? parsed.inFlight : 0,
    };
  } catch {
    return { ...DEFAULT_TURN_STATE };
  }
}

export function writeTurnState(state: TurnState): void {
  writeFileSync(getTurnStatePath(), JSON.stringify(state), 'utf8');
}

export function resetTurnState(): void {
  writeTurnState({ ...DEFAULT_TURN_STATE });
}

export function updateTurnForHook(hookName: string): TurnState {
  const current = readTurnState();

  if (hookName === 'beforeSubmitPrompt') {
    const next = {
      toolsUsed: false,
      firstToolStarted: false,
      inTurn: true,
      responseDelivered: false,
      inFlight: 0,
    };
    writeTurnState(next);
    return next;
  }

  if (hookName === 'afterAgentResponse') {
    const next = { ...current, responseDelivered: true };
    writeTurnState(next);
    return next;
  }

  if (hookName === 'stop' || hookName === 'sessionEnd' || hookName === 'sessionStart') {
    const next = { ...DEFAULT_TURN_STATE };
    writeTurnState(next);
    return next;
  }

  if (TOOLS_USED_HOOKS.has(hookName)) {
    const next = {
      ...current,
      toolsUsed: true,
      ...(FIRST_TOOL_HOOKS.has(hookName) ? { firstToolStarted: true } : {}),
    };
    writeTurnState(next);
    return next;
  }

  return current;
}

/** Increments the in-flight tool counter. Called on preToolUse/subagentStart. */
export function incrementTurnToolInFlight(): number {
  const current = readTurnState();
  const next = { ...current, inFlight: current.inFlight + 1 };
  writeTurnState(next);
  return next.inFlight;
}

/**
 * Decrements the in-flight tool counter, floored at 0 so a missed increment
 * or duplicate decrement can never wedge the counter negative. Called on
 * postToolUse/subagentStop.
 */
export function decrementTurnToolInFlight(): number {
  const current = readTurnState();
  const next = { ...current, inFlight: Math.max(0, current.inFlight - 1) };
  writeTurnState(next);
  return next.inFlight;
}

export interface SimulatedHook {
  hook: string;
  payload?: Record<string, unknown>;
}

/** Deterministic hook sequence → mapped vessel states (for CI simulation). */
export function simulateHookTimeline(hooks: readonly SimulatedHook[]): string[] {
  resetTurnState();
  const states: string[] = [];

  for (const entry of hooks) {
    const priorTurnState = readTurnState();
    const turnState = updateTurnForHook(entry.hook);
    const mapping = mapHookToState(
      entry.hook,
      entry.payload ?? {},
      turnState,
      priorTurnState,
    );
    if (mapping) {
      states.push(mapping.state);
    }
  }

  return states;
}

/** Deterministic hook sequence → visual tiers (for CI simulation). */
export function simulateVisualTimeline(hooks: readonly SimulatedHook[]): string[] {
  resetTurnState();
  const visuals: string[] = [];

  for (const entry of hooks) {
    const priorTurnState = readTurnState();
    const turnState = updateTurnForHook(entry.hook);
    const mapping = mapHookToState(
      entry.hook,
      entry.payload ?? {},
      turnState,
      priorTurnState,
    );
    if (mapping) {
      visuals.push(
        resolveVisualState({
          state: mapping.state,
          firstToolStarted: turnState.firstToolStarted,
        }),
      );
    }
  }

  return visuals;
}
