export const STATE_PROTOCOL_VERSION = '1.0' as const;

export const CLAUDE_CODE_SURFACE = 'claude-code' as const;

export const CLAUDE_CODE_VESSEL_STATES = [
  'idle',
  'thinking',
  'waiting',
  'responding',
  'success',
  'error',
  'attention',
  'working',
  'searching',
  'writing',
] as const;

export type ClaudeCodeVesselState = (typeof CLAUDE_CODE_VESSEL_STATES)[number];

export interface StateInboundPayload {
  protocol_version: typeof STATE_PROTOCOL_VERSION;
  ts: number;
  surface: typeof CLAUDE_CODE_SURFACE;
  state: ClaudeCodeVesselState;
  tool?: string;
  metadata?: Record<string, unknown>;
}

export interface HookStateMapping {
  state: ClaudeCodeVesselState;
  tool?: string;
  metadata?: Record<string, unknown>;
}
