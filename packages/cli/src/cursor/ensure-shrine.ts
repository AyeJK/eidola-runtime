import { access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EidolaRuntimeConfig } from '../config.js';
import {
  isShrineRunning,
  readShrineLock,
  removeShrineLock,
  stopShrine,
  writeShrineLock,
  type ShrineLockFile,
} from './shrine-lock.js';
import {
  isHttpShrineSurface,
  normalizeShrineSurfaceInput,
  resolveShrineSurface,
  shrineHttpPort,
  shrineHttpUrl,
  shrineSurfaceEnv,
} from './shrine-surface.js';
import type { EidolaWorkspaceConfig } from './types.js';
import { readWorkspaceConfig, writeWorkspaceConfig } from './workspace-config.js';

export interface LaunchShrineResult {
  launched: boolean;
  alreadyRunning: boolean;
  surface?: string;
  pid?: number;
  skipped?: boolean;
  reason?: string;
  mode?: 'http';
  url?: string;
  restarted?: boolean;
}

export interface LaunchShrineOptions {
  requestedSurface?: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isPublishedInstall(packageRoot: string): boolean {
  return packageRoot.replace(/\\/g, '/').includes('/node_modules/');
}

function resolveMcpPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function shrineHttpEntryCandidates(appRoot: string): string[] {
  const packageRoot = resolveMcpPackageRoot();
  const candidates = [join(packageRoot, 'shrine', 'server', 'index.js')];

  if (!isPublishedInstall(packageRoot)) {
    candidates.push(join(appRoot, 'packages', 'shrine', 'dist', 'server', 'index.js'));
  }

  return candidates;
}

function shrineHttpStartCommand(appRoot: string, envOverrides: NodeJS.ProcessEnv): {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const env: NodeJS.ProcessEnv = { ...process.env, ...envOverrides };

  if (process.env.EIDOLA_WORKSPACE) {
    env.EIDOLA_WORKSPACE = process.env.EIDOLA_WORKSPACE;
  }

  const packageRoot = resolveMcpPackageRoot();
  const shrineEntry = shrineHttpEntryCandidates(appRoot).find((path) => existsSync(path));

  if (shrineEntry) {
    return {
      command: process.execPath,
      args: [shrineEntry],
      cwd: dirname(shrineEntry),
      env,
    };
  }

  if (isPublishedInstall(packageRoot)) {
    return {
      command: process.execPath,
      args: [join(packageRoot, 'cli.js'), 'launch', 'shrine'],
      cwd: packageRoot,
      env,
    };
  }

  return {
    command: process.execPath,
    args: [join(appRoot, 'packages', 'shrine', 'dist', 'server', 'index.js')],
    cwd: join(appRoot, 'packages', 'shrine'),
    env,
  };
}

async function shrineHttpBuildReady(appRoot: string): Promise<boolean> {
  return shrineHttpEntryCandidates(appRoot).some((path) => existsSync(path));
}

/**
 * Spawn Shrine — HTTP server for browser-based display surfaces.
 * Invoked via MCP `launch_shrine` or `eidola launch shrine`.
 */
export async function launchShrine(
  config: EidolaRuntimeConfig,
  onLog: (message: string) => void = defaultLog,
  options: LaunchShrineOptions = {},
): Promise<LaunchShrineResult> {
  const lockRoot = config.workspaceRoot;
  let workspaceConfig = null;

  if (lockRoot) {
    try {
      workspaceConfig = await readWorkspaceConfig(lockRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onLog(`launch-shrine: workspace config error: ${message}`);
      return { launched: false, alreadyRunning: false, skipped: true, reason: 'config_error' };
    }
  }

  if (options.requestedSurface?.trim() && lockRoot) {
    const normalizedSurface = normalizeShrineSurfaceInput(options.requestedSurface);
    const mergedConfig: EidolaWorkspaceConfig = {
      ...(workspaceConfig ?? {}),
      shrine_surface: normalizedSurface,
    } as EidolaWorkspaceConfig;
    await writeWorkspaceConfig(lockRoot, mergedConfig);
    workspaceConfig = mergedConfig;
  }

  if (process.env.EIDOLA_SKIP_SHRINE_LAUNCH === '1') {
    return { launched: false, alreadyRunning: false, skipped: true, reason: 'disabled_env' };
  }

  const requestedSurface = options.requestedSurface?.trim();
  const surface = resolveShrineSurface({
    configSurface:
      (requestedSurface && !lockRoot ? normalizeShrineSurfaceInput(requestedSurface) : undefined) ??
      workspaceConfig?.shrine_surface,
  });
  const httpMode = isHttpShrineSurface(surface);
  const targetSurface = surface.preset === 'custom' ? `${surface.width}x${surface.height}` : surface.preset;

  if (!httpMode) {
    onLog(`launch-shrine: surface "${targetSurface}" requires Electron, which has been removed — use a browser-compatible surface`);
    return { launched: false, alreadyRunning: false, skipped: true, reason: 'electron_removed' };
  }

  let restarted = false;

  if (await isShrineRunning(lockRoot)) {
    const lock = await readShrineLock(lockRoot);
    if (lock?.surface === targetSurface) {
      return {
        launched: false,
        alreadyRunning: true,
        surface: surface.preset,
        mode: 'http',
        url: shrineHttpUrl(shrineHttpPort()),
      };
    }

    await stopShrine(lockRoot);
    restarted = true;
  } else {
    const staleLock = await readShrineLock(lockRoot);
    if (staleLock) {
      await removeShrineLock(lockRoot);
    }
  }

  if (!(await shrineHttpBuildReady(config.repoRoot))) {
    onLog('launch-shrine: shrine HTTP server not built — run pnpm build in eidola-repo first');
    return { launched: false, alreadyRunning: false, skipped: true, reason: 'not_built' };
  }

  const { command, args, cwd, env } = shrineHttpStartCommand(config.repoRoot, shrineSurfaceEnv(surface));
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    env,
  });

  child.unref();

  const port = shrineHttpPort();
  const url = shrineHttpUrl(port);
  const lock: ShrineLockFile = {
    pid: child.pid ?? 0,
    surface: surface.preset,
    started_at: new Date().toISOString(),
  };

  if (lock.pid > 0) {
    await writeShrineLock(lockRoot, lock);
  }

  onLog(`launch-shrine: HTTP ${surface.preset} at ${url} (pid ${lock.pid || 'unknown'})`);

  return {
    launched: true,
    alreadyRunning: false,
    surface: surface.preset,
    pid: lock.pid > 0 ? lock.pid : undefined,
    mode: 'http',
    url,
    restarted: restarted || undefined,
  };
}

/** @deprecated Use launchShrine */
export const ensureShrineRunning = launchShrine;

/** @deprecated Use LaunchShrineResult */
export type EnsureShrineResult = LaunchShrineResult;

function defaultLog(message: string): void {
  console.error('[eidola]', message);
}
