import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ClaudeMcpServerEntry {
  command: string;
  args: string[];
  [key: string]: unknown;
}

export interface ClaudeMcpSettings {
  mcpServers?: Record<string, ClaudeMcpServerEntry>;
  [key: string]: unknown;
}

export interface SetupClaudeMcpOptions {
  /** When true, write to ~/.claude/settings.json. Default true. */
  global?: boolean;
  /** Project workspace root when global is false. */
  workspaceRoot?: string;
}

export interface SetupClaudeMcpResult {
  settingsPath: string;
}

const EIDOLA_MCP_ENTRY: ClaudeMcpServerEntry = {
  command: 'npx',
  args: ['-y', '@eidola/cli', 'mcp'],
};

export async function setupClaudeMcp(
  options: SetupClaudeMcpOptions = {},
): Promise<SetupClaudeMcpResult> {
  const useGlobal = options.global !== false;
  const targetDir = useGlobal
    ? join(homedir(), '.claude')
    : join(options.workspaceRoot ?? process.cwd(), '.claude');
  const settingsPath = join(targetDir, 'settings.json');

  let existing: ClaudeMcpSettings = {};
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf8')) as ClaudeMcpSettings;
  } catch {
    // File doesn't exist yet — start fresh
  }

  const merged: ClaudeMcpSettings = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      eidola: EIDOLA_MCP_ENTRY,
    },
  };

  await mkdir(targetDir, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  return { settingsPath };
}
