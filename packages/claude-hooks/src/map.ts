import {
  extractReadPath,
  isSkillPath,
  resolveStateFromTool,
  type ToolAwareState,
} from '@eidola/tool-state';
import { extractSubagentMetadata } from './payload.js';
import type { HookStateMapping, ClaudeCodeVesselState } from './types.js';

/** Claude Code hooks that imply an explicit permission/approval gate. */
const ATTENTION_HOOKS = new Set(['PermissionRequest', 'Notification']);

const THINKING_HOOKS = new Set(['UserPromptSubmit']);

export function extractToolName(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.tool_name === 'string' && payload.tool_name.length > 0) {
    return payload.tool_name;
  }

  if (typeof payload.command === 'string' && payload.command.length > 0) {
    return 'Shell';
  }

  return undefined;
}

function extractToolError(payload: Record<string, unknown>): boolean {
  if (payload.tool_response && typeof payload.tool_response === 'object') {
    const response = payload.tool_response as Record<string, unknown>;
    if (response.error !== undefined && response.error !== null) {
      return true;
    }
    if (response.is_error === true) {
      return true;
    }
  }

  if (payload.is_error === true) {
    return true;
  }

  if (typeof payload.error === 'string' && payload.error.length > 0) {
    return true;
  }

  return false;
}

function resolveToolAwareState(payload: Record<string, unknown>): HookStateMapping {
  const tool = extractToolName(payload);
  const toolInput = payload.tool_input;
  let state: ToolAwareState = resolveStateFromTool(tool, 'PreToolUse', toolInput);

  if (tool === 'Read') {
    const readPath = extractReadPath(toolInput);
    if (readPath && isSkillPath(readPath)) {
      state = 'searching';
    }
  }

  return { state, tool };
}

function mapPostToolUse(payload: Record<string, unknown>): HookStateMapping {
  const tool = extractToolName(payload);

  if (extractToolError(payload)) {
    return { state: 'error', tool };
  }

  return { state: 'thinking', tool };
}

function mapSubagentStart(payload: Record<string, unknown>): HookStateMapping {
  const metadata = extractSubagentMetadata(payload);
  return {
    state: 'working',
    tool: 'Task',
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function mapStop(payload: Record<string, unknown>): HookStateMapping {
  const status = payload.status;

  if (status === 'error') {
    return { state: 'error' };
  }

  if (payload.stop_hook_active === true) {
    return { state: 'idle' };
  }

  return { state: 'success' };
}

export function mapHookToState(
  hookName: string,
  payload: Record<string, unknown> = {},
): HookStateMapping | null {
  if (ATTENTION_HOOKS.has(hookName)) {
    return { state: 'attention', tool: extractToolName(payload) };
  }

  if (THINKING_HOOKS.has(hookName)) {
    return { state: 'thinking' };
  }

  switch (hookName) {
    case 'PreToolUse':
      return resolveToolAwareState(payload);
    case 'PostToolUse':
      return mapPostToolUse(payload);
    case 'PostToolUseFailure':
      return { state: 'error', tool: extractToolName(payload) };
    case 'SubagentStart':
      return mapSubagentStart(payload);
    case 'SubagentStop':
      return { state: 'thinking' };
    case 'Stop':
      return mapStop(payload);
    case 'SessionStart':
      return { state: 'idle', metadata: { reassert_vessel: true } };
    case 'SessionEnd':
      return { state: 'idle' };
    case 'PreCompact':
      return { state: 'attention' };
    default:
      return null;
  }
}

export type { ClaudeCodeVesselState };
