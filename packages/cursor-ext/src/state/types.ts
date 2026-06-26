export const STATE_PROTOCOL_VERSION = '1.0' as const;

export const CURSOR_SURFACE = 'cursor' as const;

export const CURSOR_VESSEL_STATES = [
  'idle',
  'thinking',
  'responding',
  'error',
] as const;

export type CursorVesselState = (typeof CURSOR_VESSEL_STATES)[number];

export const StreamLifecycle = {
  StreamStart: 'stream_start',
  StreamEnd: 'stream_end',
  Error: 'error',
  Idle: 'idle',
} as const;

export type StreamLifecycleEvent =
  (typeof StreamLifecycle)[keyof typeof StreamLifecycle];

export interface StateInboundPayload {
  protocol_version: typeof STATE_PROTOCOL_VERSION;
  ts: number;
  surface: typeof CURSOR_SURFACE;
  state: CursorVesselState;
  tool?: string;
  metadata?: Record<string, unknown>;
}
