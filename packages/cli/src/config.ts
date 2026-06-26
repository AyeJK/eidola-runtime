import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readShrineEngramsDirSync } from './shrine-folder-config.js';
import {
  DEFAULT_STATE_BUFFER_SIZE,
  DEFAULT_STATE_SOCKET_PORT,
  STATE_SOCKET_HOST,
} from './socket/types.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** packages/mcp/dist → eidola-repo root in monorepo dev */
const defaultMonorepoRoot = resolve(moduleDir, '../../..');

function resolvePackageRoot(): string {
  return resolve(moduleDir, '..');
}

export function isPublishedInstall(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.EIDOLA_FORCE_PUBLISHED === '1') {
    return true;
  }
  const normalized = resolvePackageRoot().replace(/\\/g, '/');
  return normalized.includes('/node_modules/');
}

export interface EidolaPaths {
  repoRoot: string;
  engramsDir: string;
  vesselsDir: string;
}

export interface EidolaRuntimeConfig extends EidolaPaths {
  /** Cursor workspace root — where `.cursor/eidola.json` lives. Set via EIDOLA_WORKSPACE. */
  workspaceRoot?: string;
  stateSocketHost: string;
  stateSocketPort: number;
  stateBufferSize: number;
}

export function resolveEidolaPaths(env: NodeJS.ProcessEnv = process.env): EidolaPaths {
  const published = isPublishedInstall(env);
  const repoRoot = resolve(
    env.EIDOLA_ROOT ?? (published ? process.cwd() : defaultMonorepoRoot),
  );
  let defaultEngramsDir = repoRoot;
  if (env.EIDOLA_ENGRAMS_DIR === undefined) {
    defaultEngramsDir = readShrineEngramsDirSync() ?? repoRoot;
  }

  return {
    repoRoot,
    engramsDir: resolve(env.EIDOLA_ENGRAMS_DIR ?? defaultEngramsDir),
    vesselsDir: resolve(env.EIDOLA_VESSELS_DIR ?? joinPath(repoRoot, 'vessels')),
  };
}

export function inferWorkspaceRoot(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const explicit = env.EIDOLA_WORKSPACE?.trim();
  if (explicit) {
    return resolve(explicit);
  }

  const cursorPaths = env.WORKSPACE_FOLDER_PATHS?.trim();
  if (cursorPaths) {
    const first = cursorPaths.split(/[;,]/)[0]?.trim();
    if (first) {
      return resolve(first);
    }
  }

  if (isPublishedInstall(env)) {
    const cwd = resolve(process.cwd());
    // ponytail: Cursor sometimes spawns MCP with cwd = user profile — never treat that as the project
    if (cwd !== resolve(homedir())) {
      return cwd;
    }
    return undefined;
  }

  if (existsSync(join(repoRoot, '.cursor', 'eidola.json'))) {
    return repoRoot;
  }

  return undefined;
}

export function resolveEidolaRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EidolaRuntimeConfig {
  const paths = resolveEidolaPaths(env);
  const workspaceRoot = inferWorkspaceRoot(paths.repoRoot, env);
  return {
    ...paths,
    workspaceRoot,
    stateSocketHost: STATE_SOCKET_HOST,
    stateSocketPort: parsePositiveInt(env.EIDOLA_STATE_SOCKET_PORT, DEFAULT_STATE_SOCKET_PORT),
    stateBufferSize: parsePositiveInt(env.EIDOLA_STATE_BUFFER_SIZE, DEFAULT_STATE_BUFFER_SIZE),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function joinPath(base: string, segment: string): string {
  return resolve(base, segment);
}
