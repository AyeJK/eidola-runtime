import { describe, expect, it } from 'vitest';
import { migrateJsonToDirectory } from './json-to-directory.js';
import type { LegacyEngramJson } from './types.js';

describe('migrateJsonToDirectory', () => {
  it('returns a new directory package without mutating the source', () => {
    const legacy: LegacyEngramJson = {
      version: '1.4',
      id: 'camina-drummer',
      name: 'Camina Drummer',
      description: 'Belter captain',
      systemPrompt: 'You are Camina Drummer.',
      styleRules: ['Short sentences.'],
      behaviorRules: ['Push back when wrong.'],
      states: ['idle', 'thinking', 'debug', 'shipit', 'result', 'error', 'warn'],
      packId: 'camina-v1',
      metadata: {
        author: 'jeremy-kaye',
        createdAt: '2026-02-12T00:00:00Z',
        tags: ['belter'],
      },
      extensions: {
        openclaw: { reinject: true },
        custom: { nested: { value: 1 } },
      },
    };

    const snapshot = structuredClone(legacy);
    const migrated = migrateJsonToDirectory(legacy);

    expect(legacy).toEqual(snapshot);
    expect(migrated.engram.engram_version).toBe('1.0.0');
    expect(migrated.engram.id).toBe('camina-drummer');
    expect(migrated.engram.extensions).toEqual({
      openclaw: { reinject: true },
      custom: { nested: { value: 1 } },
    });
    expect(migrated.vessel.pack).toBe('camina-v1');
    expect(migrated.vessel.expressions.working).toBe('working.json');
    expect(migrated.vessel.expressions.writing).toBe('writing.json');
    expect(migrated.vessel.expressions.responding).toBe('responding.json');
    expect(migrated.vessel.expressions.attention).toBe('attention.json');
    expect(migrated.soul).toContain('Camina Drummer');
    expect(migrated.soul).toContain('You are Camina Drummer.');
  });

  it('preserves soulMd verbatim when provided', () => {
    const soulMd = '# Custom Soul\n\nAlready formatted.\n';
    const legacy: LegacyEngramJson = {
      name: 'Custom',
      soulMd,
      extensions: { keep: true },
    };

    const migrated = migrateJsonToDirectory(legacy);
    expect(migrated.soul).toBe(soulMd);
    expect(migrated.engram.extensions).toEqual({ keep: true });
  });
});
