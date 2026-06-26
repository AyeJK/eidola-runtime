import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface ShrineFolderConfig {
  engramsDir: string;
}

/** Overridable in tests so they never touch the Shaper's real `~/.eidola/shrine.json`. */
function configDir(): string {
  return process.env.EIDOLA_SHRINE_CONFIG_DIR?.trim() || join(homedir(), '.eidola');
}

function configPath(): string {
  return join(configDir(), 'shrine.json');
}

export function shrineFolderConfigPath(): string {
  return configPath();
}

export function expandHomePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('~')) {
    return resolve(join(homedir(), trimmed.slice(1).replace(/^[/\\]/, '')));
  }

  return resolve(trimmed);
}

export async function readShrineFolderConfig(): Promise<ShrineFolderConfig | null> {
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ShrineFolderConfig>;
    if (typeof parsed.engramsDir === 'string' && parsed.engramsDir.trim()) {
      return { engramsDir: resolve(parsed.engramsDir) };
    }
  } catch {
    return null;
  }

  return null;
}

export async function writeShrineFolderConfig(config: ShrineFolderConfig): Promise<void> {
  await mkdir(configDir(), { recursive: true });
  await writeFile(
    configPath(),
    `${JSON.stringify({ engramsDir: resolve(config.engramsDir) }, null, 2)}\n`,
    'utf8',
  );
}

export function isExistingDirectory(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}
