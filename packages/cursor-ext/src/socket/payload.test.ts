import { describe, expect, it } from 'vitest';
import { buildStatePayload, serializeStatePayload } from './payload.js';

describe('buildStatePayload', () => {
  it('writes valid cursor surface payloads', () => {
    const payload = buildStatePayload('thinking', { ts: 1_749_600_000_000 });

    expect(payload).toEqual({
      protocol_version: '1.0',
      ts: 1_749_600_000_000,
      surface: 'cursor',
      state: 'thinking',
    });
  });

  it('serializes newline-delimited JSON', () => {
    const line = serializeStatePayload(
      buildStatePayload('responding', { ts: 1_749_600_000_000 }),
    );

    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line.trim())).toMatchObject({
      protocol_version: '1.0',
      surface: 'cursor',
      state: 'responding',
    });
  });
});
