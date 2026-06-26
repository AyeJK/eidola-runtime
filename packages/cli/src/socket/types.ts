export const STATE_PROTOCOL_VERSION = '1.0';

export const STATE_SOCKET_HOST = '127.0.0.1';

export const DEFAULT_STATE_SOCKET_PORT = 9742;

export const DEFAULT_STATE_BUFFER_SIZE = 32;

/** Force a broadcast back to idle if no new state arrives within this window. */
export const DEFAULT_IDLE_WATCHDOG_MS = 60_000;

/**
 * Grace window (ms) a tool-adjacent `'thinking'` broadcast displays as the
 * `'waiting'` visual tier before flipping to genuine `'thinking'`. Tuned in
 * the same spirit as Shrine's `minHoldMs`/`crossfadeMs` — long enough to
 * absorb the typical "deciding what's next" gap right after a tool call,
 * short enough that sustained deliberation still reads as thinking.
 */
export const DEFAULT_THINKING_GRACE_MS = 4_500;

export const SURFACES = ['cursor', 'claude-code', 'claude-chat', 'cowork', 'manual'] as const;

export type Surface = (typeof SURFACES)[number];

export const VESSEL_STATES = [
  'idle',
  'thinking',
  'waiting',
  'working',
  'searching',
  'writing',
  'responding',
  'success',
  'error',
  'attention',
] as const;

export type VesselState = (typeof VESSEL_STATES)[number];

export interface StateInboundEvent {
  protocol_version: string;
  ts: number;
  surface: Surface;
  state: string;
  tool?: string;
  metadata?: Record<string, unknown>;
}

export interface StateBroadcast {
  protocol_version: string;
  ts: number;
  state: string;
  engram_id: string;
  expression: string;
  /** Visual tier for renderer playback when it differs from semantic `state`. */
  visual_state?: string;
  tool?: string;
}

export interface StateSocketConfig {
  host?: string;
  port?: number;
  bufferSize?: number;
  onWarn?: (message: string) => void;
  /** Reload the active Engram when hooks request reassert and a session is already bound. */
  onReassertVessel?: () => Promise<void>;
  /**
   * Idle watchdog window in ms. If no new state arrives while the Vessel is in a
   * non-idle state, the server force-broadcasts idle. Catches turns that end via
   * interruption, since Claude Code's Stop hook is not guaranteed to fire on cancel.
   * Set to 0 to disable.
   */
  idleWatchdogMs?: number;
  /**
   * Tool-adjacent thinking grace window in ms (see `DEFAULT_THINKING_GRACE_MS`).
   * Exposed for tests; production callers should rely on the default.
   */
  thinkingGraceMs?: number;
}
