export interface EngramMeta {
  author: string;
  created: string;
  description?: string;
  tags?: string[];
}

export interface EngramConfig {
  engram_version: string;
  id: string;
  name: string;
  voice_id: string | null;
  meta: EngramMeta;
  extensions: Record<string, unknown>;
}

export type VesselType = 'lottie' | 'webm' | 'mp4' | 'gif';

export interface VesselTransitions {
  default: 'crossfade' | 'cut';
  duration_ms: number;
}

export interface VesselPlayback {
  idle_loops: boolean;
  /** Mid-turn approval idle timer (ms). Overlay-only; default 3000. */
  approval_idle_ms?: number;
  /** How long overlay holds `success` before returning to idle. Overlay-only; default 3000. */
  success_hold_ms?: number;
  /** Minimum time a visual state must remain on screen before the next can play. Overlay-only; default 1000. */
  min_hold_ms?: number;
}

export interface VesselConfig {
  type: VesselType;
  pack: string;
  /** Expression map — required for all vessel types. */
  expressions: Record<string, string>;
  transitions: VesselTransitions;
  playback: VesselPlayback;
}

export interface LoadedEngram {
  directory: string;
  soul: string;
  engram: EngramConfig;
  vessel: VesselConfig;
}

export interface EngramDirectoryOutput {
  soul: string;
  vessel: VesselConfig;
  engram: EngramConfig;
}

export class EngramLoadError extends Error {
  readonly code: string;
  readonly directory?: string;

  constructor(message: string, code: string, directory?: string) {
    super(message);
    this.name = 'EngramLoadError';
    this.code = code;
    this.directory = directory;
  }
}
