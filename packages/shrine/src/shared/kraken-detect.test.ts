import { describe, expect, it } from 'vitest';
import {
  detectKrakenMode,
  isKrakenQueryParam,
  resolveBrowserShrineSurface,
  shouldApplyCircularMask,
} from './kraken-detect.js';

describe('kraken detection', () => {
  it('detects ?kraken=1 query param', () => {
    expect(isKrakenQueryParam('?kraken=1')).toBe(true);
    expect(isKrakenQueryParam('?kraken=true')).toBe(true);
    expect(isKrakenQueryParam('')).toBe(false);
  });

  it('marks config browser when kraken param absent', () => {
    const detection = detectKrakenMode('');
    expect(detection.isKrakenBrowser).toBe(false);
    expect(detection.isConfigBrowser).toBe(true);
  });

  it('marks kraken browser from query param', () => {
    const detection = detectKrakenMode('?kraken=1');
    expect(detection.isKrakenBrowser).toBe(true);
    expect(detection.isConfigBrowser).toBe(false);
  });

  it('resolves kraken-elite-v2 surface for kraken browser', () => {
    const detection = detectKrakenMode('?kraken=1');
    expect(resolveBrowserShrineSurface(detection)).toEqual({
      preset: 'kraken-elite-v2',
      width: 640,
      height: 640,
      circularMask: true,
    });
  });

  it('applies circular mask for kraken preset', () => {
    const detection = detectKrakenMode('?kraken=1');
    const surface = resolveBrowserShrineSurface(detection);
    expect(shouldApplyCircularMask(surface, detection)).toBe(true);
  });

  it('does not apply circular mask on browser preview', () => {
    const detection = detectKrakenMode('');
    const surface = resolveBrowserShrineSurface(detection);
    expect(surface.preset).toBe('browser');
    expect(shouldApplyCircularMask(surface, detection)).toBe(false);
  });
});
