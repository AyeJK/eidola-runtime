import { describe, expect, it } from 'vitest';
import { isWorkingClusterState, resolveVisualState } from '@eidola/tool-state';
import { extractToolName, mapHookToState } from '../map.js';

describe('mapHookToState', () => {
  it('maps PreToolUse with search tools to searching', () => {
    for (const tool of ['Grep', 'Glob', 'Read', 'SemanticSearch']) {
      expect(mapHookToState('PreToolUse', { tool_name: tool })).toEqual({
        state: 'searching',
        tool,
      });
    }
  });

  it('maps PreToolUse with write tools to writing', () => {
    for (const tool of ['Write', 'StrReplace', 'EditNotebook', 'Delete']) {
      expect(mapHookToState('PreToolUse', { tool_name: tool })).toEqual({
        state: 'writing',
        tool,
      });
    }
  });

  it('maps PreToolUse with Bash to working', () => {
    expect(mapHookToState('PreToolUse', { tool_name: 'Bash' })).toEqual({
      state: 'working',
      tool: 'Bash',
    });
  });

  it('maps skill file reads to searching', () => {
    expect(
      mapHookToState('PreToolUse', {
        tool_name: 'Read',
        tool_input: { file_path: 'C:/Users/me/.claude/skills/design-planner/SKILL.md' },
      }),
    ).toEqual({
      state: 'searching',
      tool: 'Read',
    });
  });

  it('maps PostToolUse success to thinking', () => {
    expect(mapHookToState('PostToolUse', { tool_name: 'Grep' })).toEqual({
      state: 'thinking',
      tool: 'Grep',
    });
  });

  it('maps PostToolUse failure to error', () => {
    expect(
      mapHookToState('PostToolUse', {
        tool_name: 'Bash',
        tool_response: { error: 'command failed' },
      }),
    ).toEqual({ state: 'error', tool: 'Bash' });

    expect(
      mapHookToState('PostToolUse', {
        tool_name: 'Bash',
        is_error: true,
      }),
    ).toEqual({ state: 'error', tool: 'Bash' });
  });

  it('maps PostToolUseFailure to error', () => {
    expect(mapHookToState('PostToolUseFailure', { tool_name: 'Bash' })).toEqual({
      state: 'error',
      tool: 'Bash',
    });
  });

  it('maps UserPromptSubmit to thinking', () => {
    expect(mapHookToState('UserPromptSubmit', {})).toEqual({ state: 'thinking' });
  });

  it('maps SubagentStart to working with metadata', () => {
    expect(
      mapHookToState('SubagentStart', {
        subagent_type: 'explore',
        task: 'Find hook registration files',
      }),
    ).toEqual({
      state: 'working',
      tool: 'Task',
      metadata: {
        subagent_type: 'explore',
        task: 'Find hook registration files',
      },
    });
  });

  it('maps SubagentStop to thinking', () => {
    expect(mapHookToState('SubagentStop', {})).toEqual({ state: 'thinking' });
  });

  it('maps PermissionRequest and Notification to attention', () => {
    expect(mapHookToState('PermissionRequest', { tool_name: 'Bash' })).toEqual({
      state: 'attention',
      tool: 'Bash',
    });
    expect(mapHookToState('Notification', {})).toEqual({ state: 'attention', tool: undefined });
  });

  it('maps Stop by status', () => {
    expect(mapHookToState('Stop', {})).toEqual({ state: 'success' });
    expect(mapHookToState('Stop', { status: 'error' })).toEqual({ state: 'error' });
    expect(mapHookToState('Stop', { stop_hook_active: true })).toEqual({ state: 'idle' });
  });

  it('maps SessionStart with vessel reassert metadata', () => {
    expect(mapHookToState('SessionStart', {})).toEqual({
      state: 'idle',
      metadata: { reassert_vessel: true },
    });
  });

  it('maps SessionEnd to idle', () => {
    expect(mapHookToState('SessionEnd', {})).toEqual({ state: 'idle' });
  });

  it('maps PreCompact to attention', () => {
    expect(mapHookToState('PreCompact', {})).toEqual({ state: 'attention' });
  });

  it('returns null for unregistered hooks', () => {
    expect(mapHookToState('UnknownEvent', {})).toBeNull();
  });

  it('covers all hook names from the template with a defined state', () => {
    const hookNames = [
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'UserPromptSubmit',
      'Notification',
      'PermissionRequest',
      'SubagentStart',
      'SubagentStop',
      'PreCompact',
      'Stop',
      'SessionStart',
      'SessionEnd',
    ];

    for (const hookName of hookNames) {
      expect(mapHookToState(hookName, { tool_name: 'Bash' })).not.toBeNull();
    }
  });

  describe('WORKING_CLUSTER collapse (Sprint 5.2 task 2)', () => {
    // claude-hooks/map.ts is intentionally stateless — it does not track
    // firstToolStarted or use TurnTracker. The WORKING_CLUSTER collapse
    // (thinking/searching/writing/working -> visual `working` after the
    // first tool fires) is applied centrally downstream, in the MCP state
    // socket server's VisualTurnTracker (packages/mcp/src/socket/visual-turn.ts),
    // which calls resolveVisualState() for every inbound event regardless
    // of which surface (cursor, claude-code, ...) sent it. This is correct
    // because the collapse only needs the *semantic state value*, which is
    // shared across surfaces — it does not need per-surface turn bookkeeping.
    //
    // This test proves the precondition that makes that downstream collapse
    // work for Claude Code payloads: every semantic state map.ts emits for
    // tool-aware hooks must be a member of WORKING_CLUSTER (or otherwise
    // pass through resolveVisualState unchanged when not in a tool turn).

    it('emits only WORKING_CLUSTER members for tool-driving hooks', () => {
      const toolHookCases: Array<[string, Record<string, unknown>]> = [
        ['PreToolUse', { tool_name: 'Bash' }],
        ['PreToolUse', { tool_name: 'Read' }],
        ['PreToolUse', { tool_name: 'Write' }],
        ['PreToolUse', { tool_name: 'Grep' }],
        ['PostToolUse', { tool_name: 'Grep' }],
        ['SubagentStart', { subagent_type: 'explore' }],
      ];

      for (const [hookName, payload] of toolHookCases) {
        const mapping = mapHookToState(hookName, payload);
        expect(mapping).not.toBeNull();
        expect(isWorkingClusterState(mapping!.state)).toBe(true);
      }
    });

    it('resolves working-cluster tool states to visual working, but keeps thinking as thinking', () => {
      // thinking is no longer collapsed into working regardless of
      // firstToolStarted — only the tool-driving states (searching/
      // writing/working) collapse to the generic visual `working` tier.
      const bash = mapHookToState('PreToolUse', { tool_name: 'Bash' })!;
      expect(resolveVisualState({ state: bash.state, firstToolStarted: false })).toBe('working');

      const postUse = mapHookToState('PostToolUse', { tool_name: 'Bash' })!;
      expect(resolveVisualState({ state: postUse.state, firstToolStarted: true })).toBe(
        'thinking',
      );

      const nextSearch = mapHookToState('PreToolUse', { tool_name: 'Grep' })!;
      expect(resolveVisualState({ state: nextSearch.state, firstToolStarted: true })).toBe(
        'working',
      );
    });

    it('does not collapse a pre-tool thinking state (UserPromptSubmit) before any tool has fired', () => {
      const promptSubmit = mapHookToState('UserPromptSubmit', {})!;
      expect(promptSubmit.state).toBe('thinking');
      expect(resolveVisualState({ state: promptSubmit.state, firstToolStarted: false })).toBe(
        'thinking',
      );
    });
  });
});

describe('extractToolName', () => {
  it('prefers tool_name over command', () => {
    expect(extractToolName({ tool_name: 'Read', command: 'ls' })).toBe('Read');
  });

  it('falls back to Shell when only command is present', () => {
    expect(extractToolName({ command: 'ls' })).toBe('Shell');
  });
});
