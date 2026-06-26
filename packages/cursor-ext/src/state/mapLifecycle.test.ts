import { describe, expect, it } from 'vitest';
import { mapStreamLifecycleToState } from './mapLifecycle.js';
import { StreamLifecycle } from './types.js';

describe('mapStreamLifecycleToState', () => {
  it('maps model stream start to thinking', () => {
    expect(mapStreamLifecycleToState(StreamLifecycle.StreamStart)).toBe('thinking');
  });

  it('maps model stream end to responding', () => {
    expect(mapStreamLifecycleToState(StreamLifecycle.StreamEnd)).toBe('responding');
  });

  it('maps error events to error', () => {
    expect(mapStreamLifecycleToState(StreamLifecycle.Error)).toBe('error');
  });

  it('maps idle to idle', () => {
    expect(mapStreamLifecycleToState(StreamLifecycle.Idle)).toBe('idle');
  });
});
