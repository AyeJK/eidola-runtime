import { describe, expect, it } from 'vitest';
import { resolveShrineSurface, isHttpShrineSurface, shrineHttpUrl } from './shrine-surface.js';

describe('shrine surface presets', () => {
  it('defaults to browser', () => {
    expect(resolveShrineSurface({})).toEqual({
      preset: 'browser',
      width: 1920,
      height: 1080,
    });
  });

  it('resolves kraken-elite-v2 preset', () => {
    expect(resolveShrineSurface({ configSurface: 'kraken-elite-v2' })).toEqual({
      preset: 'kraken-elite-v2',
      width: 640,
      height: 640,
      circularMask: true,
    });
  });

  it('identifies kraken as HTTP shrine surface', () => {
    const surface = resolveShrineSurface({ configSurface: 'kraken-elite-v2' });
    expect(isHttpShrineSurface(surface)).toBe(true);
    expect(shrineHttpUrl(9743)).toBe('http://127.0.0.1:9743/shrine');
  });
});
