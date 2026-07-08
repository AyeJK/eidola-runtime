import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isEidolaRelayCommand, type CursorHooksTemplate } from './setup-hooks.js';
import type { CursorMcpSettings } from './setup-cursor-mcp.js';

export interface UninstallCursorOptions {
  /** When true, target ~/.cursor/. Default false (workspace-scoped). */
  global?: boolean;
  /** Project workspace root when global is false. */
  workspaceRoot?: string;
}

export interface UninstallCursorMcpResult {
  mcpPath: string;
  removed: boolean;
}

export interface UninstallCursorHooksResult {
  hooksPath: string;
  removed: boolean;
}

function resolveCursorDir(options: UninstallCursorOptions): string {
  const global = options.global === true;
  const workspaceRoot = options.workspaceRoot
    ? resolve(options.workspaceRoot)
    : resolve(process.cwd());
  return global ? join(homedir(), '.cursor') : join(workspaceRoot, '.cursor');
}

export async function uninstallCursorMcp(
  options: UninstallCursorOptions = {},
): Promise<UninstallCursorMcpResult> {
  const mcpPath = join(resolveCursorDir(options), 'mcp.json');

  let existing: CursorMcpSettings | null = null;
  try {
    existing = JSON.parse(await readFile(mcpPath, 'utf8')) as CursorMcpSettings;
  } catch {
    return { mcpPath, removed: false };
  }

  if (!existing.mcpServers || !('eidola' in existing.mcpServers)) {
    return { mcpPath, removed: false };
  }

  const { eidola: _eidola, ...rest } = existing.mcpServers;
  const updated: CursorMcpSettings = { ...existing, mcpServers: rest };

  await writeFile(mcpPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return { mcpPath, removed: true };
}

export async function uninstallCursorHooks(
  options: UninstallCursorOptions = {},
): Promise<UninstallCursorHooksResult> {
  const hooksPath = join(resolveCursorDir(options), 'hooks.json');

  let existing: CursorHooksTemplate | null = null;
  try {
    existing = JSON.parse(await readFile(hooksPath, 'utf8')) as CursorHooksTemplate;
  } catch {
    return { hooksPath, removed: false };
  }

  let removed = false;
  const hooks: CursorHooksTemplate['hooks'] = {};
  for (const [hookName, entries] of Object.entries(existing.hooks ?? {})) {
    const kept = entries.filter((entry) => !isEidolaRelayCommand(entry.command));
    if (kept.length !== entries.length) {
      removed = true;
    }
    if (kept.length > 0) {
      hooks[hookName] = kept;
    }
  }

  if (!removed) {
    return { hooksPath, removed: false };
  }

  const updated: CursorHooksTemplate = { ...existing, hooks };
  await writeFile(hooksPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return { hooksPath, removed: true };
}
