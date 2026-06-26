import { describe, expect, it } from 'vitest';
import { shouldLoopExpression, shouldReturnToIdle, vesselConfigFromYaml } from './types.js';

describe('vesselConfigFromYaml', () => {
  it('maps gif vessels to the gif renderer', () => {
    const config = vesselConfigFromYaml(
      {
        type: 'gif',
        pack: 'new-vessel',
        expressions: { idle: 'idle.gif', thinking: 'thinking.gif' },
        transitions: { default: 'crossfade', duration_ms: 300 },
        playback: { idle_loops: true },
      },
      'new-vessel',
    );

    expect(config.rendererType).toBe('gif');
    expect(config.idleClip).toBe('idle.gif');
  });
});

describe('playback flags', () => {
  it('loops idle when configured', () => {
    expect(shouldLoopExpression('idle', true)).toBe(true);
    expect(shouldLoopExpression('idle', false)).toBe(false);
  });

  it('does not loop one-shot states', () => {
    expect(shouldLoopExpression('responding', true)).toBe(false);
    expect(shouldLoopExpression('error', true)).toBe(false);
    expect(shouldLoopExpression('success', true)).toBe(false);
  });

  it('loops sustained busy states during hook silence', () => {
    expect(shouldLoopExpression('thinking', true)).toBe(true);
    expect(shouldLoopExpression('working', true)).toBe(true);
    expect(shouldLoopExpression('searching', true)).toBe(true);
    expect(shouldLoopExpression('writing', true)).toBe(true);
  });

  it('marks return-to-idle states (success uses overlay hold timer)', () => {
    expect(shouldReturnToIdle('responding')).toBe(true);
    expect(shouldReturnToIdle('error')).toBe(true);
    expect(shouldReturnToIdle('success')).toBe(false);
    expect(shouldReturnToIdle('thinking')).toBe(false);
  });
});
