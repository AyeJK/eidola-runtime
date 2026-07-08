import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface CursorMcpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface CursorMcpSettings {
  mcpServers?: Record<string, CursorMcpServerEntry>;
  [key: string]: unknown;
}

export interface SetupCursorMcpOptions {
  /** When true, write to ~/.cursor/mcp.json. Default false (workspace-scoped). */
  global?: boolean;
  /** Project workspace root when global is false. */
  workspaceRoot?: string;
}

export interface SetupCursorMcpResult {
  mcpPath: string;
}

const EIDOLA_MCP_ENTRY: CursorMcpServerEntry = {
  command: 'npx',
  args: ['-y', '@eidola/cli', 'mcp'],
  env: {
    EIDOLA_WORKSPACE: '${workspaceFolder}',
  },
};

export async function setupCursorMcp(
  options: SetupCursorMcpOptions = {},
): Promise<SetupCursorMcpResult> {
  const useGlobal = options.global === true;
  const targetDir = useGlobal
    ? join(homedir(), '.cursor')
    : join(resolve(options.workspaceRoot ?? process.cwd()), '.cursor');
  const mcpPath = join(targetDir, 'mcp.json');

  let existing: CursorMcpSettings = {};
  try {
    existing = JSON.parse(await readFile(mcpPath, 'utf8')) as CursorMcpSettings;
  } catch {
    // File doesn't exist yet — start fresh
  }

  const merged: CursorMcpSettings = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      eidola: EIDOLA_MCP_ENTRY,
    },
  };

  await mkdir(targetDir, { recursive: true });
  await writeFile(mcpPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  return { mcpPath };
}
