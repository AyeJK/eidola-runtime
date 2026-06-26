import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { eidolaConfigDir } from '../workspace-registry.js';

export interface McpAwakenSignal {
  engram_id: string;
  workspace_root: string;
  engrams_dir: string;
  engram_directory: string;
  vessels_dir: string;
  ts: number;
}

export function mcpAwakenSignalPath(): string {
  return join(eidolaConfigDir(), 'mcp-awaken.json');
}

export async function writeMcpAwakenSignal(
  signal: Omit<McpAwakenSignal, 'ts'> & { ts?: number },
): Promise<void> {
  const payload: McpAwakenSignal = {
    engram_id: signal.engram_id.trim(),
    workspace_root: resolve(signal.workspace_root),
    engrams_dir: resolve(signal.engrams_dir),
    engram_directory: resolve(signal.engram_directory),
    vessels_dir: resolve(signal.vessels_dir),
    ts: signal.ts ?? Date.now(),
  };
  await mkdir(eidolaConfigDir(), { recursive: true });
  await writeFile(mcpAwakenSignalPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function readMcpAwakenSignal(): Promise<McpAwakenSignal | null> {
  try {
    const raw = await readFile(mcpAwakenSignalPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<McpAwakenSignal>;
    if (
      typeof parsed.engram_id === 'string' &&
      parsed.engram_id.trim() &&
      typeof parsed.workspace_root === 'string' &&
      parsed.workspace_root.trim() &&
      typeof parsed.engrams_dir === 'string' &&
      parsed.engrams_dir.trim() &&
      typeof parsed.engram_directory === 'string' &&
      parsed.engram_directory.trim() &&
      typeof parsed.vessels_dir === 'string' &&
      parsed.vessels_dir.trim()
    ) {
      return {
        engram_id: parsed.engram_id.trim(),
        workspace_root: resolve(parsed.workspace_root.trim()),
        engrams_dir: resolve(parsed.engrams_dir.trim()),
        engram_directory: resolve(parsed.engram_directory.trim()),
        vessels_dir: resolve(parsed.vessels_dir.trim()),
        ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
      };
    }
  } catch {
    return null;
  }

  return null;
}
