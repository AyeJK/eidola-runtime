import { describe, expect, it } from 'vitest';
import { mergeCursorHooksConfig, type CursorHooksTemplate } from './setup-hooks.js';

describe('mergeCursorHooksConfig', () => {
  const template: CursorHooksTemplate = {
    version: 1,
    hooks: {
      preToolUse: [{ command: '__RELAY__ preToolUse' }],
      stop: [{ command: '__RELAY__ stop' }],
    },
  };

  it('merges eidola hooks without removing unrelated entries', () => {
    const existing: CursorHooksTemplate = {
      version: 1,
      hooks: {
        preToolUse: [{ command: 'other-tool hook' }],
        beforeSubmitPrompt: [{ command: 'custom prompt hook' }],
      },
    };

    const merged = mergeCursorHooksConfig(existing, template, (name) => `node relay.js ${name}`);

    expect(merged.hooks.preToolUse).toEqual([
      { command: 'other-tool hook' },
      { command: 'node relay.js preToolUse' },
    ]);
    expect(merged.hooks.beforeSubmitPrompt).toEqual([{ command: 'custom prompt hook' }]);
    expect(merged.hooks.stop).toEqual([{ command: 'node relay.js stop' }]);
  });

  it('replaces prior eidola relay commands on re-run', () => {
    const existing: CursorHooksTemplate = {
      version: 1,
      hooks: {
        preToolUse: [{ command: 'node "/old/cursor-hooks/relay.js" preToolUse' }],
      },
    };

    const merged = mergeCursorHooksConfig(existing, template, (name) => `node "/new/relay.js" ${name}`);

    expect(merged.hooks.preToolUse).toEqual([{ command: 'node "/new/relay.js" preToolUse' }]);
  });
});
