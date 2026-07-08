import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isEidolaRelayCommand, type ClaudeHooksTemplate, type ClaudeSettings } from './setup-claude-hooks.js';
import type { ClaudeMcpSettings } from './setup-claude-mcp.js';

export interface UninstallClaudeOptions {
  /** When true, target ~/.claude/. Default false (workspace-scoped). */
  global?: boolean;
  /** Project workspace root when global is false. */
  workspaceRoot?: string;
}

export interface UninstallClaudeMcpResult {
  settingsPath: string;
  removed: boolean;
}

export interface UninstallClaudeHooksResult {
  settingsPath: string;
  removed: boolean;
}

function resolveClaudeDir(options: UninstallClaudeOptions): string {
  const global = options.global === true;
  const workspaceRoot = options.workspaceRoot
    ? resolve(options.workspaceRoot)
    : resolve(process.cwd());
  return global ? join(homedir(), '.claude') : join(workspaceRoot, '.claude');
}

export async function uninstallClaudeMcp(
  options: UninstallClaudeOptions = {},
): Promise<UninstallClaudeMcpResult> {
  const settingsPath = join(resolveClaudeDir(options), 'settings.json');

  let existing: ClaudeMcpSettings | null = null;
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf8')) as ClaudeMcpSettings;
  } catch {
    return { settingsPath, removed: false };
  }

  if (!existing.mcpServers || !('eidola' in existing.mcpServers)) {
    return { settingsPath, removed: false };
  }

  const { eidola: _eidola, ...rest } = existing.mcpServers;
  const updated: ClaudeMcpSettings = { ...existing, mcpServers: rest };

  await writeFile(settingsPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return { settingsPath, removed: true };
}

export async function uninstallClaudeHooks(
  options: UninstallClaudeOptions = {},
): Promise<UninstallClaudeHooksResult> {
  const settingsPath = join(resolveClaudeDir(options), 'settings.json');

  let existing: ClaudeSettings | null = null;
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf8')) as ClaudeSettings;
  } catch {
    return { settingsPath, removed: false };
  }

  let removed = false;
  const hooks: ClaudeHooksTemplate = {};
  for (const [hookName, matchers] of Object.entries(existing.hooks ?? {})) {
    const keptMatchers = matchers
      .map((matcher) => {
        const keptEntries = matcher.hooks.filter(
          (entry) => !isEidolaRelayCommand(entry.command, hookName),
        );
        if (keptEntries.length !== matcher.hooks.length) {
          removed = true;
        }
        return { ...matcher, hooks: keptEntries };
      })
      .filter((matcher) => matcher.hooks.length > 0);

    if (keptMatchers.length > 0) {
      hooks[hookName] = keptMatchers;
    }
  }

  if (!removed) {
    return { settingsPath, removed: false };
  }

  const updated: ClaudeSettings = { ...existing, hooks };
  await writeFile(settingsPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return { settingsPath, removed: true };
}
