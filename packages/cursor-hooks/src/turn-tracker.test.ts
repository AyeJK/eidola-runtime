import { describe, expect, it } from 'vitest';
import { mapHookToState } from './map.js';
import {
  decrementTurnToolInFlight,
  incrementTurnToolInFlight,
  readTurnState,
  resetTurnState,
  simulateHookTimeline,
  simulateVisualTimeline,
  updateTurnForHook,
} from './turn-tracker.js';

describe('updateTurnForHook', () => {
  it('resets toolsUsed on beforeSubmitPrompt', () => {
    resetTurnState();
    updateTurnForHook('preToolUse');
    const turn = updateTurnForHook('beforeSubmitPrompt');
    expect(turn).toEqual({
      toolsUsed: false,
      firstToolStarted: false,
      inTurn: true,
      responseDelivered: false,
      inFlight: 0,
    });
  });

  it('sets toolsUsed on tool-aware hooks', () => {
    resetTurnState();
    updateTurnForHook('beforeSubmitPrompt');
    const turn = updateTurnForHook('afterFileEdit');
    expect(turn.toolsUsed).toBe(true);
  });

  it('sets firstToolStarted on first-tool hooks only', () => {
    resetTurnState();
    updateTurnForHook('beforeSubmitPrompt');
    expect(updateTurnForHook('afterAgentThought').firstToolStarted).toBe(false);
    expect(updateTurnForHook('preToolUse').firstToolStarted).toBe(true);
    expect(updateTurnForHook('postToolUse').firstToolStarted).toBe(true);
  });

  it('resets firstToolStarted on beforeSubmitPrompt', () => {
    resetTurnState();
    updateTurnForHook('preToolUse');
    const turn = updateTurnForHook('beforeSubmitPrompt');
    expect(turn.firstToolStarted).toBe(false);
  });

  it('marks responseDelivered on afterAgentResponse', () => {
    resetTurnState();
    updateTurnForHook('beforeSubmitPrompt');
    const turn = updateTurnForHook('afterAgentResponse');
    expect(turn.responseDelivered).toBe(true);
  });

  it('clears inTurn on stop', () => {
    resetTurnState();
    updateTurnForHook('beforeSubmitPrompt');
    const turn = updateTurnForHook('stop');
    expect(turn.inTurn).toBe(false);
  });
});

describe('simulateHookTimeline', () => {
  it('text-only turn: success when text lands, idle on stop', () => {
    const states = simulateHookTimeline([
      { hook: 'beforeSubmitPrompt' },
      { hook: 'afterAgentThought' },
      { hook: 'afterAgentResponse' },
      { hook: 'stop', payload: { status: 'completed' } },
    ]);

    expect(states).toEqual(['thinking', 'thinking', 'success', 'idle']);
  });

  it('tool-heavy turn: success on afterAgentResponse', () => {
    const states = simulateHookTimeline([
      { hook: 'beforeSubmitPrompt' },
      { hook: 'preToolUse', payload: { tool_name: 'Grep' } },
      { hook: 'postToolUse', payload: { tool_name: 'Grep' } },
      { hook: 'afterAgentResponse' },
      { hook: 'stop', payload: { status: 'completed' } },
    ]);

    expect(states).toEqual(['thinking', 'searching', 'thinking', 'success', 'idle']);
  });

  it('approval gate: attention during shell approval', () => {
    const states = simulateHookTimeline([
      { hook: 'beforeSubmitPrompt' },
      { hook: 'preToolUse', payload: { tool_name: 'Shell' } },
      { hook: 'beforeShellExecution', payload: { command: 'pnpm test' } },
      { hook: 'postToolUse', payload: { tool_name: 'Shell' } },
      { hook: 'afterAgentResponse' },
      { hook: 'stop', payload: { status: 'completed' } },
    ]);

    expect(states).toEqual([
      'thinking',
      'working',
      'attention',
      'thinking',
      'success',
      'idle',
    ]);
  });

  it('stop without afterAgentResponse still emits success', () => {
    const states = simulateHookTimeline([
      { hook: 'beforeSubmitPrompt' },
      { hook: 'stop', payload: { status: 'completed' } },
    ]);

    expect(states).toEqual(['thinking', 'success']);
  });

  it('visual tier: thinking stays thinking between tool calls, tool states show working', () => {
    const visuals = simulateVisualTimeline([
      { hook: 'beforeSubmitPrompt' },
      { hook: 'preToolUse', payload: { tool_name: 'Grep' } },
      { hook: 'postToolUse', payload: { tool_name: 'Grep' } },
      { hook: 'preToolUse', payload: { tool_name: 'Write' } },
      { hook: 'postToolUse', payload: { tool_name: 'Write' } },
      { hook: 'afterAgentResponse' },
      { hook: 'stop', payload: { status: 'completed' } },
    ]);

    expect(visuals).toEqual([
      'thinking',
      'working',
      'thinking',
      'working',
      'thinking',
      'success',
      'idle',
    ]);
  });
});

describe('afterAgentResponse with turn context', () => {
  it('always maps to success when chat text finishes', () => {
    expect(mapHookToState('afterAgentResponse')).toEqual({ state: 'success' });
    expect(
      mapHookToState('afterAgentResponse', {}, {
        toolsUsed: true,
        firstToolStarted: true,
        inTurn: true,
        responseDelivered: false,
      }),
    ).toEqual({ state: 'success' });
  });
});

describe('in-flight tool counter', () => {
  it('increments the in-flight count for each tool start', () => {
    resetTurnState();

    expect(incrementTurnToolInFlight()).toBe(1);
    expect(incrementTurnToolInFlight()).toBe(2);
  });

  it('decrements the in-flight count for each tool end', () => {
    resetTurnState();
    incrementTurnToolInFlight();
    incrementTurnToolInFlight();

    expect(decrementTurnToolInFlight()).toBe(1);
    expect(decrementTurnToolInFlight()).toBe(0);
  });

  it('floors the in-flight count at 0 — a duplicate or missed decrement cannot go negative', () => {
    resetTurnState();
    incrementTurnToolInFlight();
    decrementTurnToolInFlight();

    expect(decrementTurnToolInFlight()).toBe(0);
    expect(decrementTurnToolInFlight()).toBe(0);
  });

  it('persists the in-flight count across simulated fresh-process round-trips', () => {
    // Each call simulates a fresh hook invocation (fresh process) — the
    // counter round-trips through the same turn-state file rather than
    // sharing in-memory state, matching the existing boolean-flag pattern.
    resetTurnState();
    incrementTurnToolInFlight();
    incrementTurnToolInFlight();

    expect(readTurnState().inFlight).toBe(2);
    expect(decrementTurnToolInFlight()).toBe(1);
    expect(readTurnState().inFlight).toBe(1);
  });

  it('a fresh beforeSubmitPrompt always zeroes in-flight, regardless of prior state', () => {
    resetTurnState();
    incrementTurnToolInFlight();
    incrementTurnToolInFlight();

    updateTurnForHook('beforeSubmitPrompt');

    expect(readTurnState().inFlight).toBe(0);
  });

  it('stop/sessionEnd/sessionStart also reset in-flight to 0', () => {
    for (const terminal of ['stop', 'sessionEnd', 'sessionStart']) {
      resetTurnState();
      incrementTurnToolInFlight();

      updateTurnForHook(terminal);

      expect(readTurnState().inFlight).toBe(0);
    }
  });
});
