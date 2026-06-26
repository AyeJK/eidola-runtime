import { describe, expect, it } from 'vitest';
import {
  isGatedApprovalTool,
  shouldArmApprovalIdleTimer,
  simulateApprovalIdleTimeline,
} from './approval-idle-logic.js';

describe('isGatedApprovalTool', () => {
  it('matches shell and MCP tools', () => {
    expect(isGatedApprovalTool('Shell')).toBe(true);
    expect(isGatedApprovalTool('CallMcpTool')).toBe(true);
    expect(isGatedApprovalTool('mcp__eidola__awaken')).toBe(true);
    expect(isGatedApprovalTool('Grep')).toBe(false);
  });
});

describe('shouldArmApprovalIdleTimer', () => {
  it('arms only in-turn gated working', () => {
    expect(shouldArmApprovalIdleTimer(true, 'working', 'Shell')).toBe(true);
    expect(shouldArmApprovalIdleTimer(true, 'thinking', undefined)).toBe(false);
    expect(shouldArmApprovalIdleTimer(false, 'working', 'Shell')).toBe(false);
    expect(shouldArmApprovalIdleTimer(true, 'waiting', 'Shell')).toBe(false);
    expect(shouldArmApprovalIdleTimer(true, 'working', 'Grep')).toBe(false);
  });
});

describe('simulateApprovalIdleTimeline', () => {
  it('escalates to waiting after approval_idle_ms silence', () => {
    const timeline = simulateApprovalIdleTimeline(
      [
        { atMs: 0, state: 'idle' },
        { atMs: 100, state: 'thinking' },
        { atMs: 200, state: 'working', tool: 'Shell' },
      ],
      3000,
    );

    expect(timeline.some((entry) => entry.source === 'approval-idle' && entry.state === 'waiting')).toBe(
      true,
    );
  });

  it('does not escalate during long thinking without gated tool', () => {
    const timeline = simulateApprovalIdleTimeline(
      [
        { atMs: 0, state: 'idle' },
        { atMs: 100, state: 'thinking' },
        { atMs: 5000, state: 'searching', tool: 'Grep' },
      ],
      3000,
    );

    expect(timeline.some((entry) => entry.source === 'approval-idle')).toBe(false);
  });

  it('disarms between turns', () => {
    const timeline = simulateApprovalIdleTimeline(
      [
        { atMs: 0, state: 'thinking' },
        { atMs: 100, state: 'working', tool: 'Shell' },
        { atMs: 500, state: 'success' },
        { atMs: 600, state: 'idle' },
        { atMs: 700, state: 'thinking' },
        { atMs: 800, state: 'searching', tool: 'Grep' },
      ],
      3000,
    );

    expect(timeline.filter((entry) => entry.source === 'approval-idle')).toHaveLength(0);
  });
});
