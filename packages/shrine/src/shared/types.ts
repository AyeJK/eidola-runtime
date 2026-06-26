import type { VesselConfig } from '../vendor/mcp.js';
import type { StateBroadcast } from '../vendor/mcp.js';
import type { ShrineSurface } from './shrine-surface.js';

export const SHRINE_CHANNELS = {
  state: 'shrine:state',
  vesselConfig: 'shrine:vessel-config',
  surface: 'shrine:surface',
  ready: 'shrine:ready',
  log: 'shrine:log',
} as const;

export type ShrineRendererType = 'lottie' | 'webm' | 'gif';

export interface ShrineVesselConfig {
  /** Clip format. */
  rendererType: ShrineRendererType;
  pack: string;
  idleClip: string;
  crossfadeMs: number;
  idleLoops: boolean;
  approvalIdleMs: number;
  successHoldMs: number;
  minHoldMs: number;
}

export interface ShrineStatePayload {
  broadcast: StateBroadcast & { tool?: string };
  clipUrl: string;
  loop: boolean;
  returnToIdle: boolean;
  source: 'socket' | 'fallback' | 'approval-idle';
}

export interface ShrineSurfacePayload {
  surface: ShrineSurface;
}

export function vesselConfigFromYaml(vessel: VesselConfig, pack: string): ShrineVesselConfig {
  const rendererType: ShrineRendererType =
    vessel.type === 'gif' ? 'gif' : vessel.type === 'webm' || vessel.type === 'mp4' ? 'webm' : 'lottie';

  return {
    rendererType,
    pack,
    idleClip: vessel.expressions.idle ?? 'idle.json',
    crossfadeMs: vessel.transitions.duration_ms,
    idleLoops: vessel.playback.idle_loops,
    approvalIdleMs: vessel.playback.approval_idle_ms ?? 3000,
    successHoldMs: vessel.playback.success_hold_ms ?? 3000,
    minHoldMs: vessel.playback.min_hold_ms ?? 1000,
  };
}

/** Busy states loop during hook silence; one-shot states play once then return to idle. */
export function shouldLoopExpression(state: string, idleLoops: boolean): boolean {
  if (state === 'idle') {
    return idleLoops;
  }

  if (state === 'responding' || state === 'error' || state === 'attention' || state === 'success') {
    return false;
  }

  return true;
}

export function shouldReturnToIdle(state: string): boolean {
  return state === 'responding' || state === 'error' || state === 'attention';
}

export function buildClipUrl(pack: string, clip: string): string {
  return `eidola://vessel/${encodeURIComponent(pack)}/${encodeURIComponent(clip)}`;
}

/** HTTP shrine serves vessel assets under `/vessels/`. */
export function buildHttpClipUrl(pack: string, clip: string): string {
  return `/vessels/${encodeURIComponent(pack)}/${clip.split('/').map(encodeURIComponent).join('/')}`;
}

/** Rewrite an `eidola://` clip URL for browser HTTP mode. */
export function toHttpClipUrl(clipUrl: string): string {
  if (!clipUrl.startsWith('eidola://vessel/')) {
    return clipUrl;
  }
  const path = clipUrl.slice('eidola://vessel/'.length);
  const segments = path.split('/').map((segment) => decodeURIComponent(segment));
  if (segments.length < 2) {
    return clipUrl;
  }
  const pack = segments[0] ?? '';
  const clip = segments.slice(1).join('/');
  return buildHttpClipUrl(pack, clip);
}
