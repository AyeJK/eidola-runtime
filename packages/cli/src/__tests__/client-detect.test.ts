import { describe, expect, it } from 'vitest';
import { detectClient } from '../client-detect.js';

describe('detectClient', () => {
  it('maps Cursor clientInfo.name to "cursor"', () => {
    expect(detectClient({ name: 'cursor', version: '1.0.0' })).toBe('cursor');
  });

  it('maps Cursor clientInfo.name case-insensitively', () => {
    expect(detectClient({ name: 'Cursor', version: '1.0.0' })).toBe('cursor');
  });

  it('maps Claude Code clientInfo.name to "claude_code"', () => {
    expect(detectClient({ name: 'claude-code', version: '1.0.0' })).toBe('claude_code');
  });

  it('maps Claude Code clientInfo.name with a space variant to "claude_code"', () => {
    expect(detectClient({ name: 'Claude Code', version: '1.0.0' })).toBe('claude_code');
  });

  it('maps missing clientInfo to "unknown"', () => {
    expect(detectClient(undefined)).toBe('unknown');
  });

  it('maps clientInfo with an empty name to "unknown"', () => {
    expect(detectClient({ name: '', version: '1.0.0' })).toBe('unknown');
  });

  it('maps an unrecognized clientInfo.name to "unknown"', () => {
    expect(detectClient({ name: 'some-other-editor', version: '2.0.0' })).toBe('unknown');
  });
});
