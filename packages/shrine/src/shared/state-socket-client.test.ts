import { describe, expect, it } from 'vitest';
import { parseBroadcastLine } from './state-socket-client.js';

describe('parseBroadcastLine', () => {
  it('parses valid broadcast lines', () => {
    const line =
      '{"protocol_version":"1.0","ts":1000,"state":"thinking","engram_id":"test-engram","expression":"thinking.json"}';
    expect(parseBroadcastLine(line)).toEqual({
      protocol_version: '1.0',
      ts: 1000,
      state: 'thinking',
      engram_id: 'test-engram',
      expression: 'thinking.json',
    });
  });

  it('returns null for malformed lines', () => {
    expect(parseBroadcastLine('')).toBeNull();
    expect(parseBroadcastLine('not-json')).toBeNull();
    expect(parseBroadcastLine('{"state":"thinking"}')).toBeNull();
  });
});
