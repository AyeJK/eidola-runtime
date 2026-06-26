import { normalizeExpressionKeys } from '../vendor/tool-state.js';
import { EngramLoadError, type EngramConfig, type VesselConfig } from './types.js';
import { validateEngramVersion } from './validate.js';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EngramLoadError(`Missing or invalid required field "${field}".`, 'INVALID_FIELD');
  }
  return value;
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EngramLoadError(`Missing or invalid required field "${field}".`, 'INVALID_FIELD');
  }
  return value as Record<string, unknown>;
}

export function parseEngramYaml(raw: unknown): EngramConfig {
  const data = requireObject(raw, 'engram.yaml root');

  const engramVersion = requireString(data.engram_version, 'engram_version');
  validateEngramVersion(engramVersion);

  const metaRaw = requireObject(data.meta, 'meta');
  const extensionsRaw = data.extensions;
  if (extensionsRaw === undefined) {
    throw new EngramLoadError('Missing or invalid required field "extensions".', 'INVALID_FIELD');
  }
  if (!extensionsRaw || typeof extensionsRaw !== 'object' || Array.isArray(extensionsRaw)) {
    throw new EngramLoadError('Missing or invalid required field "extensions".', 'INVALID_FIELD');
  }

  const voiceId = data.voice_id;
  if (voiceId !== null && typeof voiceId !== 'string') {
    throw new EngramLoadError('Field "voice_id" must be a string or null.', 'INVALID_FIELD');
  }

  const tagsRaw = metaRaw.tags;
  let tags: string[] | undefined;
  if (tagsRaw !== undefined) {
    if (!Array.isArray(tagsRaw) || tagsRaw.some((tag) => typeof tag !== 'string')) {
      throw new EngramLoadError('Field "meta.tags" must be an array of strings.', 'INVALID_FIELD');
    }
    tags = tagsRaw;
  }

  const descriptionRaw = metaRaw.description;
  const description =
    descriptionRaw === undefined
      ? undefined
      : typeof descriptionRaw === 'string'
        ? descriptionRaw
        : (() => {
            throw new EngramLoadError('Field "meta.description" must be a string.', 'INVALID_FIELD');
          })();

  return {
    engram_version: engramVersion,
    id: requireString(data.id, 'id'),
    name: requireString(data.name, 'name'),
    voice_id: voiceId ?? null,
    meta: {
      author: requireString(metaRaw.author, 'meta.author'),
      created: requireString(metaRaw.created, 'meta.created'),
      ...(description !== undefined ? { description } : {}),
      ...(tags !== undefined ? { tags } : {}),
    },
    extensions: { ...(extensionsRaw as Record<string, unknown>) },
  };
}

function parseExpressions(data: Record<string, unknown>, required: boolean): Record<string, string> {
  const expressions: Record<string, string> = {};
  if (!data.expressions) {
    if (required) {
      requireObject(data.expressions, 'expressions'); // throws
    }
    return expressions;
  }
  const expressionsRaw = requireObject(data.expressions, 'expressions');
  for (const [state, clip] of Object.entries(expressionsRaw)) {
    if (typeof clip !== 'string' || clip.trim().length === 0) {
      if (required) {
        throw new EngramLoadError(`Expression "${state}" must map to a clip filename.`, 'INVALID_FIELD');
      }
      continue;
    }
    expressions[state] = clip;
  }
  return normalizeExpressionKeys(expressions);
}

function parseTransitionsAndPlayback(
  data: Record<string, unknown>,
): Pick<VesselConfig, 'transitions' | 'playback'> {
  const transitionsRaw =
    data.transitions && typeof data.transitions === 'object' && !Array.isArray(data.transitions)
      ? (data.transitions as Record<string, unknown>)
      : {};

  const transitionDefaultStr = transitionsRaw.default;
  const defaultTransition: 'crossfade' | 'cut' =
    transitionDefaultStr === undefined
      ? 'crossfade'
      : transitionDefaultStr === 'crossfade' || transitionDefaultStr === 'cut'
        ? transitionDefaultStr
        : (() => {
            throw new EngramLoadError(
              'Field "transitions.default" must be "crossfade" or "cut".',
              'INVALID_FIELD',
            );
          })();

  const durationRaw = transitionsRaw.duration_ms;
  const durationMs =
    durationRaw === undefined
      ? 300
      : typeof durationRaw === 'number' && !Number.isNaN(durationRaw)
        ? durationRaw
        : (() => {
            throw new EngramLoadError(
              'Field "transitions.duration_ms" must be a number.',
              'INVALID_FIELD',
            );
          })();

  const playbackRaw =
    data.playback && typeof data.playback === 'object' && !Array.isArray(data.playback)
      ? (data.playback as Record<string, unknown>)
      : {};

  const idleLoopsRaw = playbackRaw.idle_loops;
  const idleLoops =
    idleLoopsRaw === undefined
      ? true
      : typeof idleLoopsRaw === 'boolean'
        ? idleLoopsRaw
        : (() => {
            throw new EngramLoadError(
              'Field "playback.idle_loops" must be a boolean.',
              'INVALID_FIELD',
            );
          })();

  const approvalIdleMsRaw = playbackRaw.approval_idle_ms;
  const approvalIdleMs =
    approvalIdleMsRaw === undefined
      ? 3000
      : typeof approvalIdleMsRaw === 'number' && !Number.isNaN(approvalIdleMsRaw)
        ? approvalIdleMsRaw
        : (() => {
            throw new EngramLoadError(
              'Field "playback.approval_idle_ms" must be a number.',
              'INVALID_FIELD',
            );
          })();

  const successHoldMsRaw = playbackRaw.success_hold_ms ?? playbackRaw.completed_hold_ms;
  const successHoldMs =
    successHoldMsRaw === undefined
      ? 3000
      : typeof successHoldMsRaw === 'number' && !Number.isNaN(successHoldMsRaw)
        ? successHoldMsRaw
        : (() => {
            throw new EngramLoadError(
              'Field "playback.success_hold_ms" must be a number.',
              'INVALID_FIELD',
            );
          })();

  const minHoldMsRaw = playbackRaw.min_hold_ms;
  const minHoldMs =
    minHoldMsRaw === undefined
      ? 1000
      : typeof minHoldMsRaw === 'number' && !Number.isNaN(minHoldMsRaw)
        ? minHoldMsRaw
        : (() => {
            throw new EngramLoadError(
              'Field "playback.min_hold_ms" must be a number.',
              'INVALID_FIELD',
            );
          })();

  return {
    transitions: { default: defaultTransition, duration_ms: durationMs },
    playback: {
      idle_loops: idleLoops,
      approval_idle_ms: approvalIdleMs,
      success_hold_ms: successHoldMs,
      min_hold_ms: minHoldMs,
    },
  };
}

export function parseVesselYaml(raw: unknown): VesselConfig {
  const data = requireObject(raw, 'vessel.yaml root');

  const type = data.type;
  if (type !== 'lottie' && type !== 'webm' && type !== 'mp4' && type !== 'gif') {
    throw new EngramLoadError(
      'Field "type" must be "lottie", "webm", "mp4", or "gif".',
      'INVALID_FIELD',
    );
  }

  const expressions = parseExpressions(data, true);
  const { transitions, playback } = parseTransitionsAndPlayback(data);

  return {
    type,
    pack: requireString(data.pack, 'pack'),
    expressions,
    transitions,
    playback,
  };
}
