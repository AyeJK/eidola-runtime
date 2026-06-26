import {
  CURSOR_SURFACE,
  STATE_PROTOCOL_VERSION,
  type CursorVesselState,
  type StateInboundPayload,
} from './types.js';

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

function summarizeTask(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const maxLen = 120;
  return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen - 1)}…`;
}

/** Subagent hook metadata for Phase 6 — ignored by overlay today. */
export function extractSubagentMetadata(
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};

  if (typeof payload.subagent_type === 'string' && payload.subagent_type.length > 0) {
    metadata.subagent_type = payload.subagent_type;
  }

  const task =
    summarizeTask(payload.task) ??
    summarizeTask(payload.description) ??
    summarizeTask(payload.prompt);
  if (task) {
    metadata.task = task;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
