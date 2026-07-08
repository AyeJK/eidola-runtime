import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { uninstallClaudeHooks, uninstallClaudeMcp } from './uninstall-claude.js';

describe('uninstallClaudeMcp / uninstallClaudeHooks', () => {
  let workspaceRoot: string;

  afterEach(() => {
    if (workspaceRoot) {
      rmSync(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = '';
    }
  });

  it('removes the eidola mcp entry and preserves other servers', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-claude-'));
    const claudeDir = join(workspaceRoot, '.claude');
    mkdirSync(claudeDir);
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        mcpServers: {
          eidola: { command: 'npx', args: ['-y', '@eidola/cli', 'mcp'] },
          other: { command: 'other', args: [] },
        },
      }),
    );

    const result = await uninstallClaudeMcp({ workspaceRoot });

    expect(result.removed).toBe(true);
    const written = JSON.parse(readFileSync(result.settingsPath, 'utf8'));
    expect(written.mcpServers.eidola).toBeUndefined();
    expect(written.mcpServers.other).toEqual({ command: 'other', args: [] });
  });

  it('reports not removed when the eidola entry is absent', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-claude-'));
    const claudeDir = join(workspaceRoot, '.claude');
    mkdirSync(claudeDir);
    writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({ mcpServers: {} }));

    const result = await uninstallClaudeMcp({ workspaceRoot });

    expect(result.removed).toBe(false);
  });

  it('reports not removed when settings.json is missing', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-claude-'));

    const result = await uninstallClaudeMcp({ workspaceRoot });

    expect(result.removed).toBe(false);
  });

  it('removes eidola relay hook entries and preserves unrelated matchers/keys', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-claude-'));
    const claudeDir = join(workspaceRoot, '.claude');
    mkdirSync(claudeDir);
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        theme: 'dark',
        hooks: {
          PreToolUse: [
            { matcher: '', hooks: [{ type: 'command', command: 'other-tool hook' }] },
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'node "/pkg/claude-hooks/relay.js" PreToolUse' }],
            },
          ],
          Stop: [{ hooks: [{ type: 'command', command: 'node "/pkg/claude-hooks/relay.js" Stop' }] }],
        },
      }),
    );

    const result = await uninstallClaudeHooks({ workspaceRoot });

    expect(result.removed).toBe(true);
    const written = JSON.parse(readFileSync(result.settingsPath, 'utf8'));
    expect(written.theme).toBe('dark');
    expect(written.hooks.PreToolUse).toEqual([
      { matcher: '', hooks: [{ type: 'command', command: 'other-tool hook' }] },
    ]);
    expect(written.hooks.Stop).toBeUndefined();
  });

  it('reports not removed when no relay commands are present', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-claude-'));
    const claudeDir = join(workspaceRoot, '.claude');
    mkdirSync(claudeDir);
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'other' }] }] } }),
    );

    const result = await uninstallClaudeHooks({ workspaceRoot });

    expect(result.removed).toBe(false);
  });
});
