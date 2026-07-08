import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { uninstallClaudeEngramArtifacts, uninstallCursorEngramArtifacts } from './uninstall-workspace.js';

describe('uninstallCursorEngramArtifacts', () => {
  let workspaceRoot: string;

  afterEach(() => {
    if (workspaceRoot) {
      rmSync(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = '';
    }
  });

  it('deletes the active engram .mdc and eidola.json', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-ws-'));
    mkdirSync(join(workspaceRoot, '.cursor', 'rules'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, '.cursor', 'eidola.json'),
      JSON.stringify({
        active_engram_id: 'judy-engram',
        soul_hash: 'abc123',
        compiled_at: new Date().toISOString(),
      }),
    );
    writeFileSync(join(workspaceRoot, '.cursor', 'rules', 'judy-engram.mdc'), '---\nalwaysApply: true\n---\nSoul body');

    const result = await uninstallCursorEngramArtifacts({ workspaceRoot });

    expect(result.removed).toBe(true);
    expect(existsSync(join(workspaceRoot, '.cursor', 'eidola.json'))).toBe(false);
    expect(existsSync(join(workspaceRoot, '.cursor', 'rules', 'judy-engram.mdc'))).toBe(false);
  });

  it('reports not removed when there is no eidola.json', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-ws-'));

    const result = await uninstallCursorEngramArtifacts({ workspaceRoot });

    expect(result.removed).toBe(false);
  });

  it('still clears eidola.json when the .mdc is already missing', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-ws-'));
    mkdirSync(join(workspaceRoot, '.cursor'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, '.cursor', 'eidola.json'),
      JSON.stringify({
        active_engram_id: 'judy-engram',
        soul_hash: 'abc123',
        compiled_at: new Date().toISOString(),
      }),
    );

    const result = await uninstallCursorEngramArtifacts({ workspaceRoot });

    expect(result.removed).toBe(true);
    expect(existsSync(join(workspaceRoot, '.cursor', 'eidola.json'))).toBe(false);
  });
});

describe('uninstallClaudeEngramArtifacts', () => {
  let workspaceRoot: string;

  afterEach(() => {
    if (workspaceRoot) {
      rmSync(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = '';
    }
  });

  it('removes the CLAUDE.md marker block and the soul file it points at', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-ws-'));
    mkdirSync(join(workspaceRoot, '.claude', 'souls'), { recursive: true });
    writeFileSync(join(workspaceRoot, '.claude', 'souls', 'judy-engram.md'), '# Judy\n');
    writeFileSync(
      join(workspaceRoot, 'CLAUDE.md'),
      '# Project notes\n\n<!-- eidola:soul:start -->\n@.claude/souls/judy-engram.md\n<!-- eidola:soul:end -->\n',
    );

    const result = await uninstallClaudeEngramArtifacts({ workspaceRoot });

    expect(result.removed).toBe(true);
    expect(existsSync(join(workspaceRoot, '.claude', 'souls', 'judy-engram.md'))).toBe(false);
    const claudeMd = readFileSync(join(workspaceRoot, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).not.toContain('eidola:soul:start');
    expect(claudeMd).toContain('# Project notes');
  });

  it('reports not removed when CLAUDE.md has no marker block', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-ws-'));
    writeFileSync(join(workspaceRoot, 'CLAUDE.md'), '# Project notes\n');

    const result = await uninstallClaudeEngramArtifacts({ workspaceRoot });

    expect(result.removed).toBe(false);
  });

  it('reports not removed when there is no CLAUDE.md at all', async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'eidola-uninstall-ws-'));

    const result = await uninstallClaudeEngramArtifacts({ workspaceRoot });

    expect(result.removed).toBe(false);
  });
});
