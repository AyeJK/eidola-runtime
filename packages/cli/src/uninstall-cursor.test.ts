import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { uninstallCursorHooks, uninstallCursorMcp } from './uninstall-cursor.js';

describe('uninstallCursorMcp / uninstallCursorHooks', () => {
  let workspaceRoot: string;

  afterEach(() => {
    if (workspaceRoot) {
      rmSync(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = '';
    }
  });

  it('removes the eidola mcp entry and preserves other servers', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-cursor-'));
    const cursorDir = join(workspaceRoot, '.cursor');
    mkdirSync(cursorDir);
    writeFileSync(
      join(cursorDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          eidola: { command: 'npx', args: ['-y', '@eidola/cli', 'mcp'] },
          other: { command: 'other', args: [] },
        },
      }),
    );

    const result = await uninstallCursorMcp({ workspaceRoot });

    expect(result.removed).toBe(true);
    const written = JSON.parse(readFileSync(result.mcpPath, 'utf8'));
    expect(written.mcpServers.eidola).toBeUndefined();
    expect(written.mcpServers.other).toEqual({ command: 'other', args: [] });
  });

  it('reports not removed when the eidola entry is absent', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-cursor-'));
    const cursorDir = join(workspaceRoot, '.cursor');
    mkdirSync(cursorDir);
    writeFileSync(join(cursorDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));

    const result = await uninstallCursorMcp({ workspaceRoot });

    expect(result.removed).toBe(false);
  });

  it('reports not removed when mcp.json is missing', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-cursor-'));

    const result = await uninstallCursorMcp({ workspaceRoot });

    expect(result.removed).toBe(false);
  });

  it('removes eidola relay hook entries and drops emptied hook names', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-cursor-'));
    const cursorDir = join(workspaceRoot, '.cursor');
    mkdirSync(cursorDir);
    writeFileSync(
      join(cursorDir, 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [
            { command: 'other-tool hook' },
            { command: 'node "/pkg/cursor-hooks/relay.js" preToolUse' },
          ],
          stop: [{ command: 'node "/pkg/cursor-hooks/relay.js" stop' }],
        },
      }),
    );

    const result = await uninstallCursorHooks({ workspaceRoot });

    expect(result.removed).toBe(true);
    const written = JSON.parse(readFileSync(result.hooksPath, 'utf8'));
    expect(written.hooks.preToolUse).toEqual([{ command: 'other-tool hook' }]);
    expect(written.hooks.stop).toBeUndefined();
  });

  it('reports not removed when no relay commands are present', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-cursor-'));
    const cursorDir = join(workspaceRoot, '.cursor');
    mkdirSync(cursorDir);
    writeFileSync(
      join(cursorDir, 'hooks.json'),
      JSON.stringify({ version: 1, hooks: { preToolUse: [{ command: 'other-tool hook' }] } }),
    );

    const result = await uninstallCursorHooks({ workspaceRoot });

    expect(result.removed).toBe(false);
  });
});
