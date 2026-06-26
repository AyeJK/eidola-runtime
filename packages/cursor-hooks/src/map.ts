import {

  extractReadPath,

  isSkillPath,

  resolveStateFromTool,

  type ToolAwareState,

} from '@eidola/tool-state';

import { extractSubagentMetadata } from './payload.js';

import type { TurnState } from './turn-tracker.js';

import type { CursorVesselState, HookStateMapping } from './types.js';



const APPROVAL_GATE_HOOKS = new Set(['beforeShellExecution', 'beforeMCPExecution']);



const WORKING_HOOKS = new Set(['preToolUse']);



const THINKING_HOOKS = new Set([

  'beforeSubmitPrompt',

  'afterAgentThought',

  'subagentStop',

]);



export function extractToolName(payload: Record<string, unknown>): string | undefined {

  if (typeof payload.tool_name === 'string' && payload.tool_name.length > 0) {

    return payload.tool_name;

  }



  if (typeof payload.command === 'string' && payload.command.length > 0) {

    return 'Shell';

  }



  return undefined;

}



function extractFailureType(payload: Record<string, unknown>): string | undefined {

  if (typeof payload.failure_type === 'string' && payload.failure_type.length > 0) {

    return payload.failure_type;

  }



  return undefined;

}



function resolveToolAwareState(

  hookName: string,

  payload: Record<string, unknown>,

): HookStateMapping {

  const tool = extractToolName(payload);

  const toolInput = payload.tool_input;

  let state: ToolAwareState = resolveStateFromTool(tool, hookName, toolInput);



  if (tool === 'Read') {

    const readPath = extractReadPath(toolInput);

    if (readPath && isSkillPath(readPath)) {

      state = 'searching';

    }

  }



  return { state, tool };

}



function mapApprovalGate(payload: Record<string, unknown>): HookStateMapping {

  return { state: 'attention', tool: extractToolName(payload) };

}



function mapBeforeReadFile(payload: Record<string, unknown>): HookStateMapping {

  const readPath = extractReadPath(payload);

  if (readPath && isSkillPath(readPath)) {

    return { state: 'searching', tool: 'Read' };

  }



  return { state: 'searching' };

}



function mapSubagentStart(payload: Record<string, unknown>): HookStateMapping {

  const metadata = extractSubagentMetadata(payload);

  return {

    state: 'working',

    tool: 'Task',

    ...(metadata !== undefined ? { metadata } : {}),

  };

}



function mapPostToolUseFailure(payload: Record<string, unknown>): HookStateMapping {

  const tool = extractToolName(payload);

  const failureType = extractFailureType(payload);



  if (failureType === 'permission_denied') {

    return { state: 'attention', tool };

  }



  return { state: 'error', tool };

}



function mapStop(payload: Record<string, unknown>, priorTurnState: TurnState): HookStateMapping {
  const status = payload.status;

  if (status === 'error') {
    return { state: 'error' };
  }

  if (status === 'aborted') {
    return { state: 'idle' };
  }

  if (priorTurnState.responseDelivered) {
    return { state: 'idle' };
  }

  return { state: 'success' };
}



export function mapHookToState(
  hookName: string,
  payload: Record<string, unknown> = {},
  turnState: TurnState = {
    toolsUsed: false,
    firstToolStarted: false,
    inTurn: false,
    responseDelivered: false,
    inFlight: 0,
  },
  priorTurnState?: TurnState,
): HookStateMapping | null {

  if (APPROVAL_GATE_HOOKS.has(hookName)) {

    return mapApprovalGate(payload);

  }



  if (THINKING_HOOKS.has(hookName)) {

    return { state: 'thinking', tool: extractToolName(payload) };

  }



  if (WORKING_HOOKS.has(hookName)) {

    return resolveToolAwareState(hookName, payload);

  }



  switch (hookName) {

    case 'beforeReadFile':

      return mapBeforeReadFile(payload);

    case 'afterFileEdit':

      return { state: 'writing' };

    case 'preCompact':

      return { state: 'attention' };

    case 'subagentStart':

      return mapSubagentStart(payload);

    case 'afterAgentResponse':
      return { state: 'success' };

    case 'postToolUse':

      return { state: 'thinking', tool: extractToolName(payload) };

    case 'postToolUseFailure':

      return mapPostToolUseFailure(payload);

    case 'stop':
      return mapStop(payload, priorTurnState ?? turnState);

    case 'sessionStart':

      return { state: 'idle', metadata: { reassert_vessel: true } };

    case 'sessionEnd':

      return { state: 'idle' };

    default:

      return null;

  }

}


