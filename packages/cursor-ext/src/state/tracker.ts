import { mapStreamLifecycleToState } from '../state/mapLifecycle.js';
import { StreamLifecycle, type CursorVesselState } from '../state/types.js';
import type { StateSocketWriter } from '../socket/client.js';

const DEFAULT_IDLE_MS = 5_000;

export interface StreamLifecycleTrackerOptions {
  idleMs?: number;
}

export class StreamLifecycleTracker {
  private activeStreams = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly idleMs: number;

  constructor(
    private readonly emitState: (state: CursorVesselState) => void,
    options: StreamLifecycleTrackerOptions = {},
  ) {
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  }

  onStreamStart(): void {
    this.clearIdleTimer();
    this.activeStreams += 1;
    if (this.activeStreams === 1) {
      this.emit(StreamLifecycle.StreamStart);
    }
  }

  onStreamEnd(): void {
    if (this.activeStreams > 0) {
      this.activeStreams -= 1;
    }

    if (this.activeStreams === 0) {
      this.emit(StreamLifecycle.StreamEnd);
      this.scheduleIdle();
    }
  }

  onError(): void {
    this.activeStreams = 0;
    this.emit(StreamLifecycle.Error);
    this.scheduleIdle();
  }

  onIdle(): void {
    this.activeStreams = 0;
    this.emit(StreamLifecycle.Idle);
  }

  dispose(): void {
    this.clearIdleTimer();
  }

  private emit(event: (typeof StreamLifecycle)[keyof typeof StreamLifecycle]): void {
    this.emitState(mapStreamLifecycleToState(event));
  }

  private scheduleIdle(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.activeStreams === 0) {
        this.emit(StreamLifecycle.Idle);
      }
    }, this.idleMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

export function createStreamLifecycleTracker(
  writer: StateSocketWriter,
  options?: StreamLifecycleTrackerOptions,
): StreamLifecycleTracker {
  return new StreamLifecycleTracker((state) => writer.emit(state), options);
}
