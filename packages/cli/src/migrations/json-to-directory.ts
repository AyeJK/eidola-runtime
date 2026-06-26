import type { EngramDirectoryOutput, VesselConfig } from '../engram/types.js';
import type { LegacyEngramJson } from './types.js';

const CURRENT_ENGRAM_VERSION = '1.0.0';

/** Old persona/pack state names → Phase 1 expression keys. */
const LEGACY_STATE_TO_EXPRESSION: Record<string, string> = {
  idle: 'idle',
  thinking: 'thinking',
  debug: 'working',
  working: 'working',
  warn: 'attention',
  alerting: 'attention',
  attention: 'attention',
  shipit: 'writing',
  writing: 'writing',
  searching: 'searching',
  result: 'responding',
  responding: 'responding',
  speaking: 'responding',
  confused: 'error',
  error: 'error',
  completed: 'success',
  success: 'success',
};

const DEFAULT_EXPRESSIONS: Record<string, string> = {
  idle: 'idle.json',
  thinking: 'thinking.json',
  working: 'working.json',
  searching: 'searching.json',
  writing: 'writing.json',
  responding: 'responding.json',
  success: 'responding.json',
  error: 'error.json',
  attention: 'attention.json',
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toIsoDate(value: string | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function resolvePackId(legacy: LegacyEngramJson): string {
  if (typeof legacy.packId === 'string' && legacy.packId.trim().length > 0) {
    return legacy.packId.trim();
  }

  const vessel = legacy.vessel;
  if (vessel && typeof vessel === 'object' && 'packId' in vessel) {
    const packId = (vessel as { packId?: string }).packId;
    if (typeof packId === 'string' && packId.trim().length > 0) {
      return packId.trim();
    }
  }

  const id = legacy.id?.trim() || slugify(legacy.name);
  return id ? `${id}-v1` : 'default-v1';
}

function resolveVesselType(legacy: LegacyEngramJson): 'lottie' | 'webm' {
  const vessel = legacy.vessel;
  if (vessel && typeof vessel === 'object' && 'sourceType' in vessel) {
    const sourceType = (vessel as { sourceType?: string }).sourceType;
    if (sourceType === 'webm') return 'webm';
  }
  return 'lottie';
}

function buildSoul(legacy: LegacyEngramJson): string {
  if (typeof legacy.soulMd === 'string' && legacy.soulMd.trim().length > 0) {
    return legacy.soulMd.replace(/\r\n/g, '\n').trimEnd() + '\n';
  }

  const sections: string[] = [`# ${legacy.name.trim()}`];
  if (legacy.description?.trim()) {
    sections.push('', legacy.description.trim());
  }
  if (legacy.systemPrompt?.trim()) {
    sections.push('', legacy.systemPrompt.trim());
  }
  if (legacy.styleRules?.length) {
    sections.push('', '## Style', ...legacy.styleRules.map((rule) => `- ${rule}`));
  }
  if (legacy.behaviorRules?.length) {
    sections.push('', '## Rules', ...legacy.behaviorRules.map((rule) => `- ${rule}`));
  }

  return sections.join('\n').trimEnd() + '\n';
}

function expressionFilename(key: string): string {
  return `${key}.json`;
}

function buildExpressions(legacy: LegacyEngramJson): Record<string, string> {
  if (legacy.expressions && Object.keys(legacy.expressions).length > 0) {
    return { ...legacy.expressions };
  }

  const expressions: Record<string, string> = { ...DEFAULT_EXPRESSIONS };
  const states = legacy.states ?? Object.keys(LEGACY_STATE_TO_EXPRESSION);

  for (const state of states) {
    const mapped = LEGACY_STATE_TO_EXPRESSION[state.toLowerCase()];
    if (!mapped) continue;
    expressions[mapped] = expressionFilename(mapped);
  }

  expressions.success ??= 'responding.json';
  return expressions;
}

function buildVesselConfig(legacy: LegacyEngramJson): VesselConfig {
  return {
    type: resolveVesselType(legacy),
    pack: resolvePackId(legacy),
    expressions: buildExpressions(legacy),
    transitions: {
      default: 'crossfade',
      duration_ms: 300,
    },
    playback: {
      idle_loops: true,
      approval_idle_ms: 3000,
    },
  };
}

/**
 * Pure migration from legacy `.engram.json` to directory package fields.
 * Never mutates the input object.
 */
export function migrateJsonToDirectory(legacy: LegacyEngramJson): EngramDirectoryOutput {
  const source = structuredClone(legacy);
  const id = source.id?.trim() || slugify(source.name);

  return {
    soul: buildSoul(source),
    vessel: buildVesselConfig(source),
    engram: {
      engram_version: CURRENT_ENGRAM_VERSION,
      id,
      name: source.name.trim(),
      voice_id:
        source.voice && typeof source.voice.voiceId === 'string' ? source.voice.voiceId : null,
      meta: {
        author: source.metadata?.author?.trim() || 'unknown',
        created: toIsoDate(source.metadata?.createdAt),
        ...(source.description?.trim() ? { description: source.description.trim() } : {}),
        ...(source.metadata?.tags?.length ? { tags: [...source.metadata.tags] } : {}),
      },
      extensions:
        source.extensions && typeof source.extensions === 'object' && !Array.isArray(source.extensions)
          ? structuredClone(source.extensions)
          : {},
    },
  };
}
