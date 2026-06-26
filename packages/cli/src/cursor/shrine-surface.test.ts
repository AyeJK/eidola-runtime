import { describe, expect, it } from 'vitest';
import { normalizeShrineSurfaceInput, resolveShrineSurface } from './shrine-surface.js';

describe('normalizeShrineSurfaceInput', () => {
  it.each(['kraken', 'kraken-lcd', 'kraken-elite', 'kraken-elite-v2', 'KRAKEN'])(
    'maps %s to kraken-elite-v2',
    (alias) => {
      expect(normalizeShrineSurfaceInput(alias)).toBe('kraken-elite-v2');
    },
  );

  it('passes through known presets', () => {
    expect(normalizeShrineSurfaceInput('browser')).toBe('browser');
  });

  it('passes through custom dimensions', () => {
    expect(normalizeShrineSurfaceInput('800x600')).toBe('800x600');
  });

  it('resolves normalized kraken alias via config surface', () => {
    const normalized = normalizeShrineSurfaceInput('kraken');
    expect(resolveShrineSurface({ configSurface: normalized }).preset).toBe('kraken-elite-v2');
  });
});
