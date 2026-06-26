import { loadEngramFromDirectory } from '../engram/loader.js';
import type { LoadedEngram } from '../engram/types.js';
import type { SoulSource } from '../cursor/soul-source.js';
import { buildSoulInjectionPayload, type SoulInjectionPayload } from '../soul/injection.js';

export interface ActiveEngramSnapshot {
  engram_id: string;
  name: string;
  engram: LoadedEngram['engram'];
  vessel: LoadedEngram['vessel'];
  expression: string | null;
  soul_source: SoulSource;
}

export class SessionState {
  private active: LoadedEngram | null = null;
  private expressionOverride: string | null = null;
  private soulSource: SoulSource = 'none';

  getActive(): LoadedEngram | null {
    return this.active;
  }

  getExpressionOverride(): string | null {
    return this.expressionOverride;
  }

  getSoulSource(): SoulSource {
    return this.soulSource;
  }

  async load(directory: string, soulSource: Exclude<SoulSource, 'none'> = 'injection'): Promise<LoadedEngram> {
    const loaded = await loadEngramFromDirectory(directory);
    this.active = loaded;
    this.expressionOverride = null;
    this.soulSource = soulSource;
    return loaded;
  }

  /** Clear the active Engram — inverse of `load`, used by `sleep`. */
  clearActive(): void {
    this.active = null;
    this.expressionOverride = null;
    this.soulSource = 'none';
  }

  async reloadActive(): Promise<LoadedEngram | null> {
    if (!this.active) {
      return null;
    }

    const directory = this.active.directory;
    const loaded = await loadEngramFromDirectory(directory);
    this.active = loaded;
    return loaded;
  }

  setExpression(state: string): void {
    this.expressionOverride = state;
  }

  buildInitialSoulInjection(): SoulInjectionPayload | null {
    if (!this.active) {
      return null;
    }

    return buildSoulInjectionPayload(this.active.engram.id, this.active.soul);
  }

  snapshot(): ActiveEngramSnapshot | null {
    if (!this.active) {
      return null;
    }

    return {
      engram_id: this.active.engram.id,
      name: this.active.engram.name,
      engram: this.active.engram,
      vessel: this.active.vessel,
      expression: this.expressionOverride,
      soul_source: this.soulSource,
    };
  }
}
