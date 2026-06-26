import type { ShrineStatePayload, ShrineSurfacePayload, ShrineVesselConfig } from './types.js';

export interface ShrineApi {
  onState(handler: (payload: ShrineStatePayload) => void): () => void;
  onVesselConfig(handler: (config: ShrineVesselConfig) => void): () => void;
  onSurface(handler: (payload: ShrineSurfacePayload) => void): () => void;
  onAwakened(handler: (payload: { engram_id: string }) => void): () => void;
  onAsleep(handler: (payload: { engram_id: string }) => void): () => void;
  ready(): void;
  log(message: string): void;
}

declare global {
  interface Window {
    eidolaShrine: ShrineApi;
  }
}

export {};
