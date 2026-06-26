import { execSync } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const SHRINE_LOCK_FILENAME = 'eidola-shrine.lock';

export interface ShrineLockFile {
  pid: number;
  surface: string;
  started_at: string;
}

export function shrineLockDirectory(workspaceRoot?: string): string {
  if (workspaceRoot) {
    return join(workspaceRoot, '.cursor');
  }

  return join(homedir(), '.eidola');
}

export function shrineLockPath(workspaceRoot?: string): string {
  return join(shrineLockDirectory(workspaceRoot), SHRINE_LOCK_FILENAME);
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

export async function readShrineLock(workspaceRoot?: string): Promise<ShrineLockFile | null> {
  const lockPath = shrineLockPath(workspaceRoot);
  try {
    const raw = await readFile(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as ShrineLockFile;
    if (typeof parsed.pid !== 'number' || typeof parsed.started_at !== 'string') {
      return null;
    }
    if (typeof parsed.surface !== 'string') {
      return null;
    }
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeShrineLock(workspaceRoot: string | undefined, lock: ShrineLockFile): Promise<void> {
  const lockDir = shrineLockDirectory(workspaceRoot);
  await mkdir(lockDir, { recursive: true });
  const lockPath = join(lockDir, SHRINE_LOCK_FILENAME);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

export async function removeShrineLock(workspaceRoot?: string): Promise<void> {
  try {
    await unlink(shrineLockPath(workspaceRoot));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function isShrineRunning(workspaceRoot?: string): Promise<boolean> {
  const lock = await readShrineLock(workspaceRoot);
  if (!lock) {
    return false;
  }

  return isProcessAlive(lock.pid);
}

export async function stopShrine(
  workspaceRoot?: string,
): Promise<{ stopped: boolean; pid?: number; surface?: string }> {
  const lock = await readShrineLock(workspaceRoot);
  if (!lock) {
    return { stopped: false };
  }

  const pid = lock.pid;
  if (!isProcessAlive(pid)) {
    await removeShrineLock(workspaceRoot);
    return { stopped: false, pid, surface: lock.surface };
  }

  try {
    process.kill(pid);
  } catch {
    // Process may have exited between liveness check and kill.
  }

  await removeShrineLock(workspaceRoot);
  return { stopped: true, pid, surface: lock.surface };
}

function findPidsOnPortWindows(port: number): number[] {
  const output = execSync('netstat -ano', { encoding: 'utf8' });
  const pids = new Set<number>();
  for (const line of output.split('\n')) {
    if (!line.includes(`:${port}`) || !line.includes('LISTENING')) {
      continue;
    }
    const pid = Number.parseInt(line.trim().split(/\s+/).pop() ?? '', 10);
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }
  return [...pids];
}

function findPidsOnPortPosix(port: number): number[] {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });
    return output
      .split('\n')
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

/** Kills any process bound to `port`, regardless of the lock file. Catches orphans left behind by a crashed or stale Shrine. */
export function killProcessesOnPort(port: number): number[] {
  const pids = process.platform === 'win32' ? findPidsOnPortWindows(port) : findPidsOnPortPosix(port);
  const killed: number[] = [];
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGKILL');
      }
      killed.push(pid);
    } catch {
      // Already gone.
    }
  }
  return killed;
}
