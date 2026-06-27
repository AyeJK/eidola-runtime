/** Shell / MCP tools that may block on user approval — arms approval-idle timer. */
export function isGatedApprovalTool(tool?: string): boolean {
  if (!tool) {
    return false;
  }

  if (tool === 'Shell' || tool === 'CallMcpTool') {
    return true;
  }

  return tool.startsWith('mcp__') || tool.startsWith('mcp_');
}

export function isTurnEndState(state: string, inTurn: boolean): boolean {
  if (state === 'success') {
    return true;
  }

  return state === 'idle' && inTurn;
}

export function shouldArmApprovalIdleTimer(
  inTurn: boolean,
  state: string,
  tool?: string,
): boolean {
  if (!inTurn || state === 'waiting') {
    return false;
  }

  return state === 'working' && isGatedApprovalTool(tool);
}

export interface ApprovalIdleEvent {
  atMs: number;
  state: string;
  tool?: string;
  source?: string;
}

/** Pure timeline: when silence after gated working exceeds threshold → waiting. */
export function simulateApprovalIdleTimeline(
  events: readonly ApprovalIdleEvent[],
  approvalIdleMs: number,
): Array<{ state: string; source: string; atMs: number }> {
  const timeline: Array<{ state: string; source: string; atMs: number }> = [];
  let inTurn = false;
  let armedAt: number | null = null;

  for (const event of events) {
    if (event.source === 'approval-idle') {
      continue;
    }

    if (armedAt !== null && event.atMs - armedAt >= approvalIdleMs) {
      timeline.push({ state: 'waiting', source: 'approval-idle', atMs: armedAt + approvalIdleMs });
      armedAt = null;
    }

    timeline.push({
      state: event.state,
      source: event.source ?? 'socket',
      atMs: event.atMs,
    });

    if (isTurnEndState(event.state, inTurn)) {
      inTurn = false;
      armedAt = null;
      continue;
    }

    if (!inTurn && event.state === 'thinking') {
      inTurn = true;
    }

    armedAt = null;

    if (shouldArmApprovalIdleTimer(inTurn, event.state, event.tool)) {
      armedAt = event.atMs;
    }
  }

  if (armedAt !== null) {
    timeline.push({
      state: 'waiting',
      source: 'approval-idle',
      atMs: armedAt + approvalIdleMs,
    });
  }

  return timeline;
}
