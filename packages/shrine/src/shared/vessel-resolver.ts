import { join } from 'node:path';
import { access } from 'node:fs/promises';
import {
  loadEngramFromDirectory,
  resolveEidolaRuntimeConfig,
  resolveEngramLocation,
  EngramLoadError,
  type LoadedEngram,
} from '../vendor/mcp.js';
import {
  buildClipUrl,
  shouldLoopExpression,
  shouldReturnToIdle,
  vesselConfigFromYaml,
  type ShrineStatePayload,
  type ShrineVesselConfig,
} from './types.js';

export interface VesselResolverOptions {
  engramsDir: string;
  vesselsDir: string;
  /** When false, sync skips catalog lookup and logs a folder-not-configured hint. */
  folderConfigured?: boolean;
  /** Optional catalog ids — used to distinguish wrong id from missing folder. */
  catalogIds?: Set<string>;
}

export class VesselResolver {
  private engramsDir: string;
  private vesselsDir: string;
  private folderConfigured: boolean;
  private catalogIds: Set<string>;
  private activeEngramId = '';
  private activeEngramDir = '';
  private activeVesselsDir = '';
  private loaded: LoadedEngram | null = null;
  private shrineConfig: ShrineVesselConfig | null = null;
  private lastValidConfig: ShrineVesselConfig | null = null;

  constructor(options: VesselResolverOptions) {
    this.engramsDir = options.engramsDir;
    this.vesselsDir = options.vesselsDir;
    this.folderConfigured = options.folderConfigured ?? true;
    this.catalogIds = options.catalogIds ?? new Set();
  }

  setPaths(engramsDir: string, vesselsDir: string): void {
    this.engramsDir = engramsDir;
    this.vesselsDir = vesselsDir;
    this.clearActiveEngram();
  }

  setFolderConfigured(configured: boolean): void {
    this.folderConfigured = configured;
  }

  setCatalogIds(ids: Iterable<string>): void {
    this.catalogIds = new Set(ids);
  }

  bindActiveEngram(engramId: string, engramDirectory: string, vesselsDir: string): void {
    this.activeEngramId = engramId;
    this.activeEngramDir = engramDirectory;
    this.activeVesselsDir = vesselsDir;
    this.vesselsDir = vesselsDir;
  }

  private clearActiveEngram(): void {
    this.activeEngramId = '';
    this.activeEngramDir = '';
    this.activeVesselsDir = '';
    this.loaded = null;
    this.shrineConfig = null;
  }

  getConfig(): ShrineVesselConfig | null {
    return this.shrineConfig ?? this.lastValidConfig;
  }

  async syncEngram(engramId: string, engramDirectory?: string): Promise<ShrineVesselConfig | null> {
    if (!engramId) {
      return this.shrineConfig ?? this.lastValidConfig;
    }

    if (engramId === this.activeEngramId && this.activeVesselsDir) {
      this.vesselsDir = this.activeVesselsDir;
    }

    if (engramId === this.activeEngramId && this.shrineConfig && !engramDirectory) {
      return this.shrineConfig;
    }

    if (!this.folderConfigured) {
      console.warn('[eidola-shrine] no Eidola folder configured — set folder in Shrine settings');
      return this.lastValidConfig;
    }

    try {
      let directory = engramDirectory;
      let vesselsDir = this.vesselsDir;

      if (!directory) {
        if (engramId === this.activeEngramId && this.activeEngramDir) {
          directory = this.activeEngramDir;
          vesselsDir = this.activeVesselsDir || vesselsDir;
        } else {
          const located = await resolveEngramLocation(this.engramsDir, engramId);
          directory = located.directory;
          vesselsDir = located.vesselsDir;
        }
      }

      this.vesselsDir = vesselsDir;
      const loaded = await loadEngramFromDirectory(directory);
      this.loaded = loaded;
      this.activeEngramId = engramId;
      this.activeEngramDir = directory;
      this.activeVesselsDir = vesselsDir;
      this.shrineConfig = vesselConfigFromYaml(loaded.vessel, loaded.vessel.pack);
      this.lastValidConfig = this.shrineConfig;
      return this.shrineConfig;
    } catch (error) {
      this.logSyncFailure(engramId, error);
      return this.lastValidConfig;
    }
  }

  private logSyncFailure(engramId: string, error: unknown): void {
    if (error instanceof EngramLoadError && error.code === 'MISSING_ENGRAM') {
      if (this.catalogIds.size > 0 && !this.catalogIds.has(engramId)) {
        console.warn(
          `[eidola-shrine] engram "${engramId}" not found in Eidola folder — check active_engram_id`,
        );
        return;
      }

      console.warn(`[eidola-shrine] engram "${engramId}" not found in Eidola folder`);
      return;
    }

    console.error('[eidola-shrine] failed to load engram; keeping last valid vessel', error);
  }

  async buildStatePayload(
    broadcast: {
      state: string;
      engram_id: string;
      expression: string;
      ts: number;
      protocol_version: string;
      visual_state?: string;
      tool?: string;
    },
    source: ShrineStatePayload['source'] = 'socket',
  ): Promise<ShrineStatePayload | null> {
    const config = await this.syncEngram(broadcast.engram_id);
    if (!config) {
      return null;
    }

    const clip = await this.resolveClipForConfig(config, broadcast.expression);
    const loop = shouldLoopExpression(broadcast.state, config.idleLoops);
    const returnToIdle = shouldReturnToIdle(broadcast.state);

    return {
      broadcast: {
        protocol_version: broadcast.protocol_version,
        ts: broadcast.ts,
        state: broadcast.state,
        engram_id: broadcast.engram_id,
        expression: broadcast.expression,
        ...(broadcast.visual_state !== undefined
          ? { visual_state: broadcast.visual_state }
          : {}),
        ...(broadcast.tool !== undefined ? { tool: broadcast.tool } : {}),
      },
      clipUrl: buildClipUrl(config.pack, clip),
      loop,
      returnToIdle,
      source,
    };
  }

  async buildIdlePayload(
    broadcast: {
      protocol_version: string;
      ts: number;
      engram_id: string;
    },
  ): Promise<ShrineStatePayload | null> {
    const config = await this.syncEngram(broadcast.engram_id);
    if (!config) {
      return null;
    }

    const clip = await this.resolveClipForConfig(config, config.idleClip);

    return {
      broadcast: {
        protocol_version: broadcast.protocol_version,
        ts: broadcast.ts,
        state: 'idle',
        engram_id: broadcast.engram_id,
        expression: clip,
      },
      clipUrl: buildClipUrl(config.pack, clip),
      loop: config.idleLoops,
      returnToIdle: false,
      source: 'fallback',
    };
  }

  private async resolveClipForConfig(
    config: ShrineVesselConfig,
    clip: string,
  ): Promise<string> {
    return this.resolveClip(config.pack, clip, config.idleClip);
  }

  private async resolveClip(pack: string, clip: string, idleClip: string): Promise<string> {
    const primary = join(this.vesselsDir, pack, clip);
    if (await fileExists(primary)) {
      return clip;
    }

    console.error(`[eidola-shrine] missing clip "${clip}"; falling back to idle`);
    const fallback = join(this.vesselsDir, pack, idleClip);
    if (await fileExists(fallback)) {
      return idleClip;
    }

    return idleClip;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function createDefaultResolver(options?: Partial<VesselResolverOptions>): VesselResolver {
  const runtime = resolveEidolaRuntimeConfig();
  return new VesselResolver({
    engramsDir: options?.engramsDir ?? runtime.engramsDir,
    vesselsDir: options?.vesselsDir ?? runtime.vesselsDir,
    folderConfigured: options?.folderConfigured,
    catalogIds: options?.catalogIds,
  });
}

export type { LoadedEngram };
