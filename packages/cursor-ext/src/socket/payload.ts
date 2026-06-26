import {
  CURSOR_SURFACE,
  STATE_PROTOCOL_VERSION,
  type CursorVesselState,
  type StateInboundPayload,
} from '../state/types.js';

export const DEFAULT_STATE_SOCKET_HOST = '127.0.0.1';
export const DEFAULT_STATE_SOCKET_PORT = 9742;

export function buildStatePayload(
  state: CursorVesselState,
  options: {
    ts?: number;
    tool?: string;
    metadata?: Record<string, unknown>;
  } = {},
): StateInboundPayload {
  return {
    protocol_version: STATE_PROTOCOL_VERSION,
    ts: options.ts ?? Date.now(),
    surface: CURSOR_SURFACE,
    state,
    ...(options.tool !== undefined ? { tool: options.tool } : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

export function serializeStatePayload(payload: StateInboundPayload): string {
  return `${JSON.stringify(payload)}\n`;
}

export function resolveSocketPort(): number {
  const raw = process.env.EIDOLA_STATE_SOCKET_PORT;
  if (!raw) {
    return DEFAULT_STATE_SOCKET_PORT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_STATE_SOCKET_PORT;
  }

  return parsed;
}
