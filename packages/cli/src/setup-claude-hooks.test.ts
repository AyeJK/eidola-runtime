import { describe, expect, it } from 'vitest';
import { mergeClaudeHooksConfig, type ClaudeHooksTemplate, type ClaudeSettings } from './setup-claude-hooks.js';

describe('mergeClaudeHooksConfig', () => {
  const template: ClaudeHooksTemplate = {
    PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: '__RELAY__ PreToolUse' }] }],
    Stop: [{ hooks: [{ type: 'command', command: '__RELAY__ Stop' }] }],
  };

  it('merges eidola hooks without removing unrelated entries', () => {
    const existing: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'other-tool hook' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'custom prompt hook' }] }],
      },
    };

    const merged = mergeClaudeHooksConfig(existing, template, (name) => `node relay.js ${name}`);

    expect(merged.hooks?.PreToolUse).toEqual([
      { matcher: '', hooks: [{ type: 'command', command: 'other-tool hook' }] },
      { matcher: '', hooks: [{ type: 'command', command: 'node relay.js PreToolUse' }] },
    ]);
    expect(merged.hooks?.UserPromptSubmit).toEqual([
      { hooks: [{ type: 'command', command: 'custom prompt hook' }] },
    ]);
    expect(merged.hooks?.Stop).toEqual([
      { hooks: [{ type: 'command', command: 'node relay.js Stop' }] },
    ]);
  });

  it('replaces prior eidola relay commands on re-run (idempotent)', () => {
    const existing: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: '',
            hooks: [{ type: 'command', command: 'node "/old/claude-hooks/relay.js" PreToolUse' }],
          },
        ],
      },
    };

    const merged = mergeClaudeHooksConfig(
      existing,
      template,
      (name) => `node "/new/relay.js" ${name}`,
    );

    expect(merged.hooks?.PreToolUse).toEqual([
      { matcher: '', hooks: [{ type: 'command', command: 'node "/new/relay.js" PreToolUse' }] },
    ]);
  });

  it('preserves unrelated top-level settings keys', () => {
    const existing: ClaudeSettings = {
      theme: 'dark',
      hooks: {},
    };

    const merged = mergeClaudeHooksConfig(existing, template, (name) => `node relay.js ${name}`);

    expect(merged.theme).toBe('dark');
  });

  it('running merge twice with the same relay path produces stable output', () => {
    const relayCommand = (name: string) => `node "/fixed/relay.js" ${name}`;
    const first = mergeClaudeHooksConfig(null, template, relayCommand);
    const second = mergeClaudeHooksConfig(first, template, relayCommand);

    expect(second).toEqual(first);
  });
});
