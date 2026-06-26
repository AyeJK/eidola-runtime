import type { ShrineStatePayload, ShrineVesselConfig } from '../shared/types.js';

/** States that cancel a success hold (new turn or error paths). */
const SUCCESS_HOLD_CANCEL_STATES = new Set([
  'thinking',
  'working',
  'searching',
  'writing',
  'waiting',
  'responding',
  'error',
  'attention',
]);

/**
 * Holds `success` on screen for `successHoldMs` before transitioning to idle.
 * Defers socket `idle` from `stop` until the hold elapses (relay fires idle immediately after text).
 */
export class SuccessHoldController {
  private config: ShrineVesselConfig | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private holding = false;
  private readonly onRelease: () => void;

  constructor(onRelease: () => void) {
    this.onRelease = onRelease;
  }

  setConfig(config: ShrineVesselConfig): void {
    this.config = config;
  }

  disarm(): void {
    this.holding = false;
    this.clearTimer();
  }

  /**
   * Returns payload to apply now, or null when idle should wait for the hold timer.
   */
  filter(payload: ShrineStatePayload): ShrineStatePayload | null {
    if (payload.source !== 'socket') {
      return payload;
    }

    const state = payload.broadcast.state;

    if (SUCCESS_HOLD_CANCEL_STATES.has(state)) {
      this.disarm();
      return payload;
    }

    if (state === 'success') {
      this.holding = true;
      this.armTimer();
      return payload;
    }

    if (state === 'idle' && this.holding) {
      return null;
    }

    return payload;
  }

  private armTimer(): void {
    this.clearTimer();
    const ms = this.config?.successHoldMs ?? 3000;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.holding) {
        return;
      }
      this.holding = false;
      this.onRelease();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
