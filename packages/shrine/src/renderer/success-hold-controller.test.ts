import { describe, expect, it, vi } from 'vitest';
import { SuccessHoldController } from './success-hold-controller.js';
import type { ShrineStatePayload, ShrineVesselConfig } from '../shared/types.js';

const vesselConfig: ShrineVesselConfig = {
  rendererType: 'lottie',
  pack: 'camina-shrine',
  idleClip: 'idle.json',
  crossfadeMs: 300,
  idleLoops: true,
  approvalIdleMs: 3000,
  successHoldMs: 2000,
  minHoldMs: 500,
};

function socketPayload(state: string): ShrineStatePayload {
  return {
    broadcast: {
      protocol_version: '1.0',
      ts: 0,
      state,
      engram_id: 'camina-drummer',
      expression: `${state}.json`,
    },
    clipUrl: 'eidola://vessel/camina-shrine/idle.json',
    loop: false,
    returnToIdle: false,
    source: 'socket',
  };
}

describe('SuccessHoldController', () => {
  it('defers idle while holding success', () => {
    const onRelease = vi.fn();
    const hold = new SuccessHoldController(onRelease);
    hold.setConfig(vesselConfig);

    expect(hold.filter(socketPayload('success'))?.broadcast.state).toBe('success');
    expect(hold.filter(socketPayload('idle'))).toBeNull();
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('releases to idle after hold timer', () => {
    vi.useFakeTimers();
    const onRelease = vi.fn();
    const hold = new SuccessHoldController(onRelease);
    hold.setConfig(vesselConfig);

    hold.filter(socketPayload('success'));
    vi.advanceTimersByTime(2000);

    expect(onRelease).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('disarms on error states', () => {
    const onRelease = vi.fn();
    const hold = new SuccessHoldController(onRelease);
    hold.setConfig(vesselConfig);

    hold.filter(socketPayload('success'));
    expect(hold.filter(socketPayload('error'))?.broadcast.state).toBe('error');
    expect(hold.filter(socketPayload('idle'))?.broadcast.state).toBe('idle');
  });
});
