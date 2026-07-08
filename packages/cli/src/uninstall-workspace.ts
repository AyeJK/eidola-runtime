import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { findActiveSoulImportEngramId, removeSoulImport } from './claude/claude-md.js';
import { removeSoulFromWorkspace } from './claude/copy-soul.js';
import { cursorRulePath, readWorkspaceConfig, workspaceConfigPath } from './cursor/workspace-config.js';

export interface UninstallWorkspaceOptions {
  /** Workspace root to clean up. Defaults to process.cwd(). */
  workspaceRoot?: string;
}

export interface UninstallCursorEngramResult {
  mdcPath: string | null;
  configPath: string;
  removed: boolean;
}

export interface UninstallClaudeEngramResult {
  soulPath: string | null;
  claudeMdPath: string;
  removed: boolean;
}

async function unlinkIfExists(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Removes the awaken-written Cursor artifacts for the workspace's currently
 * active Engram (`.cursor/rules/{id}.mdc` and `.cursor/eidola.json`), as
 * tracked by `eidola.json` itself. Same end state as `sleep`'s Cursor path
 * (`removeEngramFromWorkspace`), just driven from persisted config instead
 * of a live session — there's no MCP server running during `uninstall`.
 */
export async function uninstallCursorEngramArtifacts(
  options: UninstallWorkspaceOptions = {},
): Promise<UninstallCursorEngramResult> {
  const root = resolve(options.workspaceRoot ?? process.cwd());
  const configPath = workspaceConfigPath(root);
  const workspaceConfig = await readWorkspaceConfig(root);

  if (!workspaceConfig?.active_engram_id) {
    return { mdcPath: null, configPath, removed: false };
  }

  const mdcPath = cursorRulePath(root, workspaceConfig.active_engram_id);
  const mdcRemoved = await unlinkIfExists(mdcPath);
  const configRemoved = await unlinkIfExists(configPath);

  return {
    mdcPath: mdcRemoved ? mdcPath : null,
    configPath,
    removed: mdcRemoved || configRemoved,
  };
}

/**
 * Removes the awaken-written Claude Code artifacts for the workspace's
 * currently active Engram: the CLAUDE.md `<!-- eidola:soul:start -->` marker
 * block and its `.claude/souls/{id}.md` soul copy, as tracked by the marker
 * block's import line itself.
 */
export async function uninstallClaudeEngramArtifacts(
  options: UninstallWorkspaceOptions = {},
): Promise<UninstallClaudeEngramResult> {
  const root = resolve(options.workspaceRoot ?? process.cwd());
  const engramId = await findActiveSoulImportEngramId(root);

  const removedImport = await removeSoulImport(root);
  const removedSoul = engramId ? await removeSoulFromWorkspace(root, engramId) : null;

  return {
    soulPath: removedSoul?.removed ? removedSoul.soulPath : null,
    claudeMdPath: removedImport.claudeMdPath,
    removed: removedImport.removed || (removedSoul?.removed ?? false),
  };
}
