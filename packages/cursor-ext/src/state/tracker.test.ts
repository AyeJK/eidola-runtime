import { describe, expect, it, vi } from 'vitest';
import { StreamLifecycleTracker } from './tracker.js';

describe('StreamLifecycleTracker', () => {
  it('emits thinking on first stream start', () => {
    const emit = vi.fn();
    const tracker = new StreamLifecycleTracker(emit);

    tracker.onStreamStart();

    expect(emit).toHaveBeenCalledWith('thinking');
  });

  it('does not emit thinking again while nested streams are active', () => {
    const emit = vi.fn();
    const tracker = new StreamLifecycleTracker(emit);

    tracker.onStreamStart();
    tracker.onStreamStart();
    emit.mockClear();

    tracker.onStreamEnd();

    expect(emit).not.toHaveBeenCalledWith('thinking');
    expect(emit).not.toHaveBeenCalledWith('responding');
  });

  it('emits responding when the last stream ends', () => {
    const emit = vi.fn();
    const tracker = new StreamLifecycleTracker(emit);

    tracker.onStreamStart();
    tracker.onStreamEnd();

    expect(emit).toHaveBeenCalledWith('responding');
  });

  it('emits error on error and resets active streams', () => {
    const emit = vi.fn();
    const tracker = new StreamLifecycleTracker(emit);

    tracker.onStreamStart();
    tracker.onStreamStart();
    emit.mockClear();

    tracker.onError();

    expect(emit).toHaveBeenCalledWith('error');
  });

  it('emits idle after inactivity timeout', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const tracker = new StreamLifecycleTracker(emit, { idleMs: 1_000 });

    tracker.onStreamStart();
    tracker.onStreamEnd();
    emit.mockClear();

    vi.advanceTimersByTime(1_000);

    expect(emit).toHaveBeenCalledWith('idle');
    vi.useRealTimers();
  });
});
