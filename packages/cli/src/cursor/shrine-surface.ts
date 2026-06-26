export type ShrineSurfacePresetId = 'browser' | 'kraken-elite-v2';

export interface ShrineSurface {
  preset: ShrineSurfacePresetId | 'custom';
  width: number;
  height: number;
  circularMask?: boolean;
}

export const SHRINE_SURFACE_PRESETS: Record<
  ShrineSurfacePresetId,
  { width: number; height: number; circularMask?: boolean }
> = {
  browser: { width: 1920, height: 1080 },
  'kraken-elite-v2': {
    width: 640,
    height: 640,
    circularMask: true,
  },
};

export const DEFAULT_SHRINE_SURFACE_PRESET: ShrineSurfacePresetId = 'browser';

const KRAKEN_SURFACE_ALIASES = new Set([
  'kraken',
  'kraken-lcd',
  'kraken-elite',
  'kraken-elite-v2',
]);

export function normalizeShrineSurfaceInput(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (KRAKEN_SURFACE_ALIASES.has(lower)) {
    return 'kraken-elite-v2';
  }

  if (lower in SHRINE_SURFACE_PRESETS) {
    return lower as ShrineSurfacePresetId;
  }

  if (parseCustomDimensions(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

export const DEFAULT_SHRINE_HTTP_PORT = 9743;

export interface ResolveShrineSurfaceInput {
  surfaceEnv?: string | undefined;
  widthEnv?: string | undefined;
  heightEnv?: string | undefined;
  configSurface?: string | undefined;
}

function parseCustomDimensions(value: string): ShrineSurface | null {
  const match = value.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) {
    return null;
  }

  const width = Number.parseInt(match[1] ?? '', 10);
  const height = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { preset: 'custom', width, height };
}

export function resolveShrineSurface(input: ResolveShrineSurfaceInput = {}): ShrineSurface {
  const widthEnv = input.widthEnv ?? process.env.EIDOLA_SHRINE_WIDTH;
  const heightEnv = input.heightEnv ?? process.env.EIDOLA_SHRINE_HEIGHT;
  if (widthEnv?.trim() && heightEnv?.trim()) {
    const width = Number.parseInt(widthEnv.trim(), 10);
    const height = Number.parseInt(heightEnv.trim(), 10);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { preset: 'custom', width, height };
    }
  }

  const surfaceRaw =
    input.surfaceEnv?.trim() ||
    input.configSurface?.trim() ||
    process.env.EIDOLA_SHRINE_SURFACE?.trim() ||
    DEFAULT_SHRINE_SURFACE_PRESET;

  const custom = parseCustomDimensions(surfaceRaw);
  if (custom) {
    return custom;
  }

  const preset = SHRINE_SURFACE_PRESETS[surfaceRaw as ShrineSurfacePresetId];
  if (preset) {
    return { preset: surfaceRaw as ShrineSurfacePresetId, ...preset };
  }

  const fallback = SHRINE_SURFACE_PRESETS[DEFAULT_SHRINE_SURFACE_PRESET];
  return { preset: DEFAULT_SHRINE_SURFACE_PRESET, ...fallback };
}

/** All surfaces now run as HTTP — Electron removed in Phase 4.1. Always returns true. */
export function isHttpShrineSurface(_surface: ShrineSurface): boolean {
  return true;
}

export function shrineHttpPort(): number {
  const raw = process.env.EIDOLA_SHRINE_HTTP_PORT?.trim();
  if (!raw) {
    return DEFAULT_SHRINE_HTTP_PORT;
  }
  const port = Number.parseInt(raw, 10);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_SHRINE_HTTP_PORT;
}

export function shrineHttpUrl(port: number = shrineHttpPort()): string {
  return `http://127.0.0.1:${port}/shrine`;
}

export function shrineSurfaceEnv(surface: ShrineSurface): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    EIDOLA_SHRINE_SURFACE: surface.preset === 'custom' ? `${surface.width}x${surface.height}` : surface.preset,
    EIDOLA_SHRINE_WIDTH: String(surface.width),
    EIDOLA_SHRINE_HEIGHT: String(surface.height),
  };
  return env;
}
