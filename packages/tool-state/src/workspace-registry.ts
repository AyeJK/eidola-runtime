import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Shared `~/.eidola/workspace.json` read/write — the single implementation
 * both `@eidola/cli` (the MCP server, which knows the workspace root
 * directly) and `@eidola/claude-hooks` (the hook relay, which only has a
 * hook payload's `cwd`) import, so the format and path can't drift between
 * two hand-synced copies. Lives in `@eidola/tool-state` because that's
 * already the dependency-free shared package vendored into both consumers'
 * builds (see `packages/mcp/scripts/prepare-dist.mjs`), not because this is
 * tool-state mapping logic — it isn't. A standalone package for one writer
 * would be more ceremony than the problem warrants.
 */
export interface WorkspaceRegistry {
  workspace_root: string;
  updated_at: string;
}

export function eidolaConfigDir(): string {
  return join(homedir(), '.eidola');
}

export function workspaceRegistryPath(configDir: string = eidolaConfigDir()): string {
  return join(configDir, 'workspace.json');
}

export async function writeWorkspaceRegistry(
  workspaceRoot: string,
  configDir: string = eidolaConfigDir(),
): Promise<void> {
  const payload: WorkspaceRegistry = {
    workspace_root: resolve(workspaceRoot),
    updated_at: new Date().toISOString(),
  };
  await mkdir(configDir, { recursive: true });
  await writeFile(workspaceRegistryPath(configDir), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function readWorkspaceRegistry(
  configDir: string = eidolaConfigDir(),
): Promise<WorkspaceRegistry | null> {
  try {
    const raw = await readFile(workspaceRegistryPath(configDir), 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkspaceRegistry>;
    if (typeof parsed.workspace_root === 'string' && parsed.workspace_root.trim()) {
      return {
        workspace_root: resolve(parsed.workspace_root.trim()),
        updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : '',
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Write the registry from a Claude Code hook payload's `cwd`, which may be
 * missing or malformed (hook stdin is loosely typed JSON). No-ops silently
 * on an unusable `cwd` — mirrors the old `claude-hooks` writer's contract,
 * since hook relay failures must never block Claude Code.
 */
export async function writeWorkspaceFromCwd(
  cwd: unknown,
  configDir: string = eidolaConfigDir(),
): Promise<void> {
  if (typeof cwd !== 'string' || !cwd.trim()) {
    return;
  }
  await writeWorkspaceRegistry(cwd.trim(), configDir);
}
