import type { ShrineSurface } from './shrine-surface.js';
import { SHRINE_SURFACE_PRESETS } from './shrine-surface.js';

export interface NzxtViewport {
  width: number;
  height: number;
  shape: string;
  targetFps?: number;
}

export interface KrakenDetection {
  /** CAM Kraken LCD browser (`?kraken=1` or `window.nzxt.v1`). */
  isKrakenBrowser: boolean;
  /** CAM configuration browser (same URL, no kraken param). */
  isConfigBrowser: boolean;
  viewport: NzxtViewport | null;
}

interface NzxtV1 {
  width?: number;
  height?: number;
  shape?: string;
  targetFps?: number;
}

declare global {
  interface Window {
    nzxt?: {
      v1?: NzxtV1;
    };
  }
}

export function readNzxtViewport(): NzxtViewport | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const v1 = window.nzxt?.v1;
  if (!v1) {
    return null;
  }

  const width = typeof v1.width === 'number' ? v1.width : 640;
  const height = typeof v1.height === 'number' ? v1.height : 640;
  const shape = typeof v1.shape === 'string' ? v1.shape : 'circle';
  const targetFps = typeof v1.targetFps === 'number' ? v1.targetFps : undefined;

  return { width, height, shape, targetFps };
}

export function isKrakenQueryParam(search?: string): boolean {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(query);
  const kraken = params.get('kraken');
  return kraken === '1' || kraken === 'true';
}

export function detectKrakenMode(search?: string): KrakenDetection {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const krakenQuery = isKrakenQueryParam(query);
  const viewport = readNzxtViewport();
  const isKrakenBrowser = krakenQuery || viewport !== null;

  return {
    isKrakenBrowser,
    isConfigBrowser: !isKrakenBrowser,
    viewport,
  };
}

/** Resolve runtime surface for browser/CAM contexts. */
export function resolveBrowserShrineSurface(
  detection: KrakenDetection,
  fallbackPreset: keyof typeof SHRINE_SURFACE_PRESETS = 'browser',
): ShrineSurface {
  if (!detection.isKrakenBrowser) {
    return { preset: fallbackPreset, ...SHRINE_SURFACE_PRESETS[fallbackPreset] };
  }

  const preset = SHRINE_SURFACE_PRESETS['kraken-elite-v2'];
  const viewport = detection.viewport;

  if (!viewport) {
    return { preset: 'kraken-elite-v2', ...preset };
  }

  const circularMask = viewport.shape === 'circle' || preset.circularMask === true;

  return {
    preset: 'kraken-elite-v2',
    width: viewport.width,
    height: viewport.height,
    circularMask,
  };
}

export function shouldApplyCircularMask(surface: ShrineSurface, detection: KrakenDetection): boolean {
  if (!detection.isKrakenBrowser) {
    return false;
  }

  if (surface.circularMask) {
    return true;
  }

  if (detection.viewport?.shape === 'circle') {
    return true;
  }

  return false;
}
