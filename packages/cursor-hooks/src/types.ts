export const STATE_PROTOCOL_VERSION = '1.0' as const;



export const CURSOR_SURFACE = 'cursor' as const;



export const CURSOR_VESSEL_STATES = [
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



export type CursorVesselState = (typeof CURSOR_VESSEL_STATES)[number];



export interface StateInboundPayload {

  protocol_version: typeof STATE_PROTOCOL_VERSION;

  ts: number;

  surface: typeof CURSOR_SURFACE;

  state: CursorVesselState;

  tool?: string;

  metadata?: Record<string, unknown>;

}



export interface HookStateMapping {

  state: CursorVesselState;

  tool?: string;

  metadata?: Record<string, unknown>;

}

