import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EidolaWorkspaceConfig } from './types.js';

export const EIDOLA_WORKSPACE_CONFIG_FILENAME = 'eidola.json';

export function workspaceConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.cursor', EIDOLA_WORKSPACE_CONFIG_FILENAME);
}

export function cursorRulePath(workspaceRoot: string, engramId: string): string {
  return join(workspaceRoot, '.cursor', 'rules', `${engramId}.mdc`);
}

export async function readWorkspaceConfig(workspaceRoot: string): Promise<EidolaWorkspaceConfig | null> {
  const configPath = workspaceConfigPath(workspaceRoot);
  try {
    const raw = await readFile(configPath, 'utf8');
    return JSON.parse(raw) as EidolaWorkspaceConfig;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeWorkspaceConfig(
  workspaceRoot: string,
  config: EidolaWorkspaceConfig,
): Promise<void> {
  const cursorDir = join(workspaceRoot, '.cursor');
  await mkdir(cursorDir, { recursive: true });
  const configPath = workspaceConfigPath(workspaceRoot);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function buildWorkspaceConfig(params: {
  engramId: string;
  soulHash: string;
  engramsDir?: string;
  shrineSurface?: EidolaWorkspaceConfig['shrine_surface'];
}): EidolaWorkspaceConfig {
  const config: EidolaWorkspaceConfig = {
    active_engram_id: params.engramId,
    soul_hash: params.soulHash,
    compiled_at: new Date().toISOString(),
  };

  if (params.engramsDir) {
    config.engrams_dir = params.engramsDir;
  }

  if (params.shrineSurface) {
    config.shrine_surface = params.shrineSurface;
  }

  return config;
}
