/** Tracks `firstToolStarted` for visual tier resolution on the state socket. */

const TOOL_CLUSTER_STATES = new Set(['searching', 'writing', 'working']);

/** Visual tiers considered "busy" for in-flight suppression purposes. */
const BUSY_VISUAL_STATES = new Set(['working', 'searching', 'writing', 'waiting']);

/** Terminal states that fully clear turn + grace-timer tracking. */
const TERMINAL_STATES = new Set(['idle', 'success', 'error']);

export class VisualTurnTracker {
  private firstToolStarted = false;
  private graceTimer: NodeJS.Timeout | null = null;
  private lastBusyVisualState: string | null = null;

  getFirstToolStarted(): boolean {
    return this.firstToolStarted;
  }

  /** True while a grace-period flip is armed, awaiting elapse or cancellation. */
  hasArmedGraceTimer(): boolean {
    return this.graceTimer !== null;
  }

  /** Last busy visual tier broadcast (working/searching/writing/waiting), for in-flight suppression. */
  getLastBusyVisualState(): string | null {
    return this.lastBusyVisualState;
  }

  /** Records the visual tier that actually went out, so suppression has a busy tier to hold. */
  recordVisualState(visualState: string): void {
    if (BUSY_VISUAL_STATES.has(visualState)) {
      this.lastBusyVisualState = visualState;
    }
  }

  reset(): void {
    this.firstToolStarted = false;
    this.lastBusyVisualState = null;
    this.clearGraceTimer();
  }

  /**
   * Cancels any armed grace timer without flipping — called when a new
   * tool-aware (searching/writing/working) broadcast arrives before the
   * grace window elapses, same cancel-and-rearm shape as scheduleIdleWatchdog.
   */
  clearGraceTimer(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  /**
   * Arms the grace-period flip timer. `onElapse` fires if nothing else
   * (tool-aware broadcast or terminal state) cancels/clears it first.
   */
  armGraceTimer(ms: number, onElapse: () => void): void {
    this.clearGraceTimer();
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      onElapse();
    }, ms);
  }

  update(state: string, metadata?: Record<string, unknown>): boolean {
    if (metadata?.first_tool_started === true) {
      this.firstToolStarted = true;
    } else if (metadata?.first_tool_started === false) {
      this.firstToolStarted = false;
    } else if (TERMINAL_STATES.has(state)) {
      this.firstToolStarted = false;
    } else if (TOOL_CLUSTER_STATES.has(state)) {
      this.firstToolStarted = true;
    }

    if (TERMINAL_STATES.has(state) || TOOL_CLUSTER_STATES.has(state)) {
      this.clearGraceTimer();
    }

    if (TERMINAL_STATES.has(state)) {
      this.lastBusyVisualState = null;
    }

    return this.firstToolStarted;
  }
}
