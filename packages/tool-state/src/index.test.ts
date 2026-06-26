import { describe, expect, it } from 'vitest';
import {
  extractReadPath,
  extractSubagentType,
  isSkillPath,
  LEGACY_VESSEL_STATE_ALIASES,
  normalizeExpressionKeys,
  normalizeVesselState,
  refineGenericWorkingState,
  resolveStateFromTool,
  resolveVisualState,
} from './index.js';

describe('resolveStateFromTool', () => {
  it('maps search tools to searching', () => {
    for (const tool of ['Grep', 'Glob', 'Read', 'SemanticSearch', 'TabRead']) {
      expect(resolveStateFromTool(tool, 'preToolUse')).toBe('searching');
    }
  });

  it('maps write tools to writing', () => {
    for (const tool of ['Write', 'StrReplace', 'EditNotebook', 'Delete', 'TabWrite']) {
      expect(resolveStateFromTool(tool, 'preToolUse')).toBe('writing');
    }
  });

  it('maps shell, task, and MCP tools to working', () => {
    expect(resolveStateFromTool('Shell', 'preToolUse')).toBe('working');
    expect(resolveStateFromTool('Task', 'preToolUse')).toBe('working');
    expect(resolveStateFromTool('CallMcpTool', 'preToolUse')).toBe('working');
    expect(resolveStateFromTool('mcp__eidola__awaken', 'beforeMCPExecution')).toBe(
      'working',
    );
  });

  it('maps Task explore subagents to searching', () => {
    expect(
      resolveStateFromTool('Task', 'preToolUse', { subagent_type: 'explore' }),
    ).toBe('searching');
    expect(
      resolveStateFromTool('Task', 'preToolUse', { subagent_type: 'generalPurpose' }),
    ).toBe('searching');
  });

  it('maps Task shell subagents to working', () => {
    expect(resolveStateFromTool('Task', 'preToolUse', { subagent_type: 'shell' })).toBe(
      'working',
    );
  });

  it('defaults tool-aware hooks to working when tool is unknown', () => {
    expect(resolveStateFromTool(undefined, 'beforeShellExecution')).toBe('working');
    expect(resolveStateFromTool(undefined, 'beforeMCPExecution')).toBe('working');
    expect(resolveStateFromTool('UnknownTool', 'preToolUse')).toBe('working');
  });
});

describe('isSkillPath', () => {
  it('detects skill file paths', () => {
    expect(isSkillPath('C:/Users/me/.cursor/skills/design-planner/SKILL.md')).toBe(true);
    expect(isSkillPath('/home/user/skills-cursor/create-rule/SKILL.md')).toBe(true);
    expect(isSkillPath('.cursor/skills/foo/SKILL.md')).toBe(true);
    expect(isSkillPath('packages/cursor-hooks/src/map.ts')).toBe(false);
  });
});

describe('extractReadPath', () => {
  it('reads path and file_path fields', () => {
    expect(extractReadPath({ path: '/tmp/SKILL.md' })).toBe('/tmp/SKILL.md');
    expect(extractReadPath({ file_path: '/tmp/readme.md' })).toBe('/tmp/readme.md');
    expect(extractReadPath({ command: 'ls' })).toBeUndefined();
  });
});

describe('extractSubagentType', () => {
  it('reads subagent_type from tool input', () => {
    expect(extractSubagentType({ subagent_type: 'explore' })).toBe('explore');
    expect(extractSubagentType({})).toBeUndefined();
  });
});

describe('resolveVisualState', () => {
  it('maps pre-tool thinking to visual thinking', () => {
    expect(resolveVisualState({ state: 'thinking', firstToolStarted: false })).toBe('thinking');
  });

  it('keeps thinking as visual thinking even after the first tool has started', () => {
    expect(resolveVisualState({ state: 'thinking', firstToolStarted: true })).toBe('thinking');
  });

  it('maps busy cluster semantics to visual working after first tool', () => {
    for (const state of ['searching', 'writing', 'working']) {
      expect(resolveVisualState({ state, firstToolStarted: true })).toBe('working');
    }
  });

  it('passes through non-cluster states unchanged', () => {
    for (const state of ['idle', 'waiting', 'responding', 'success', 'error', 'attention']) {
      expect(resolveVisualState({ state, firstToolStarted: false })).toBe(state);
      expect(resolveVisualState({ state, firstToolStarted: true })).toBe(state);
    }
  });

  // Phase 5.3.2 (tool-adjacent thinking grace period) deliberately lives in
  // the stateful broadcaster (packages/mcp/src/socket/server.ts and
  // visual-turn.ts), not here — resolveVisualState must stay a pure function
  // of its inputs with no timer, session, or other I/O dependency, and its
  // `'thinking'` -> `'thinking'` passthrough (regardless of firstToolStarted)
  // must remain exactly as it was before that sprint.
  it('regression: still a pure function unaffected by the Phase 5.3.2 grace period', () => {
    expect(resolveVisualState({ state: 'thinking', firstToolStarted: false })).toBe('thinking');
    expect(resolveVisualState({ state: 'thinking', firstToolStarted: true })).toBe('thinking');

    // Same input, called repeatedly, with no timers/clocks involved — always
    // the same output. No hidden mutable module-level state to leak across
    // calls or sessions.
    const first = resolveVisualState({ state: 'thinking', firstToolStarted: true });
    const second = resolveVisualState({ state: 'thinking', firstToolStarted: true });
    expect(first).toBe(second);
    expect(resolveVisualState.length).toBe(1);
  });
});

describe('refineGenericWorkingState', () => {
  it('refines working to searching or writing from tool name', () => {
    expect(refineGenericWorkingState('working', 'Grep')).toBe('searching');
    expect(refineGenericWorkingState('working', 'Write')).toBe('writing');
    expect(refineGenericWorkingState('working', 'Shell')).toBe('working');
  });

  it('leaves non-working states unchanged', () => {
    expect(refineGenericWorkingState('thinking', 'Grep')).toBe('thinking');
    expect(refineGenericWorkingState('working', undefined)).toBe('working');
  });
});

describe('normalizeVesselState', () => {
  it('maps legacy vessel state aliases to canonical keys', () => {
    expect(normalizeVesselState('completed')).toBe('success');
    expect(normalizeVesselState('confused')).toBe('error');
    expect(normalizeVesselState('alerting')).toBe('attention');
    expect(normalizeVesselState('thinking')).toBe('thinking');
  });

  it('exports legacy alias map', () => {
    expect(LEGACY_VESSEL_STATE_ALIASES).toEqual({
      completed: 'success',
      confused: 'error',
      alerting: 'attention',
    });
  });
});

describe('normalizeExpressionKeys', () => {
  it('remaps legacy keys to canonical names', () => {
    expect(
      normalizeExpressionKeys({
        completed: 'responding.json',
        confused: 'confused.json',
        alerting: 'alerting.json',
      }),
    ).toEqual({
      success: 'responding.json',
      error: 'confused.json',
      attention: 'alerting.json',
    });
  });

  it('prefers canonical keys when both legacy and canonical exist', () => {
    expect(
      normalizeExpressionKeys({
        completed: 'legacy.json',
        success: 'responding.json',
        confused: 'old.json',
        error: 'error.json',
      }),
    ).toEqual({
      success: 'responding.json',
      error: 'error.json',
    });
  });
});
