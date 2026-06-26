import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

interface ShrineFolderConfig {
  engramsDir: string;
}

export function shrineFolderConfigPath(): string {
  return join(homedir(), '.eidola', 'shrine.json');
}

/** Sync read of ~/.eidola/shrine.json — mirrors packages/shrine shared config shape. */
export function readShrineEngramsDirSync(configPath = shrineFolderConfigPath()): string | undefined {
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ShrineFolderConfig>;
    if (typeof parsed.engramsDir === 'string' && parsed.engramsDir.trim()) {
      const resolved = resolve(parsed.engramsDir.trim());
      if (existsSync(resolved)) {
        return resolved;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}
