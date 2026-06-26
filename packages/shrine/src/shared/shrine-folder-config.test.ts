import { describe, expect, it } from 'vitest';
import { expandHomePath } from './shrine-folder-config.js';

describe('shrine folder config', () => {
  it('expands leading tilde to home directory', () => {
    const expanded = expandHomePath('~/Documents/Eidola');
    expect(expanded).toContain('Documents');
    expect(expanded).toContain('Eidola');
    expect(expanded).not.toContain('~');
  });

  it('returns empty string for blank input', () => {
    expect(expandHomePath('   ')).toBe('');
  });
});
