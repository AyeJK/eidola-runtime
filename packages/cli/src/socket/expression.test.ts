import { describe, expect, it } from 'vitest';
import type { VesselConfig } from '../engram/types.js';
import { resolveExpressionClip } from './expression.js';

const lottieVessel: VesselConfig = {
  type: 'lottie',
  pack: 'test-pack',
  expressions: {
    idle: 'idle.json',
    thinking: 'thinking.json',
    working: 'working.json',
    responding: 'responding.json',
  },
  transitions: { default: 'crossfade', duration_ms: 300 },
  playback: { idle_loops: true },
};

describe('resolveExpressionClip', () => {
  it('returns direct clip when present', () => {
    expect(resolveExpressionClip('thinking', lottieVessel)).toBe('thinking.json');
  });

  it('falls back cluster semantics to working clip when no per-state clip', () => {
    expect(resolveExpressionClip('searching', lottieVessel)).toBe('working.json');
    expect(resolveExpressionClip('writing', lottieVessel)).toBe('working.json');
  });

  it('falls back to idle when vessel is null', () => {
    expect(resolveExpressionClip('searching', null)).toBe('idle.json');
  });

  it('resolves visual tier working directly', () => {
    expect(resolveExpressionClip('working', lottieVessel)).toBe('working.json');
  });
});
