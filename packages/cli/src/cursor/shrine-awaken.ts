import { isShrineRunning } from './shrine-lock.js';
import { shrineHttpPort, shrineHttpUrl } from './shrine-surface.js';

export interface PostShrineAwakenResult {
  attempted: boolean;
  ok: boolean;
  shrine_synced?: boolean;
  error?: string;
}

export interface PostShrineSleepResult {
  attempted: boolean;
  ok: boolean;
  shrine_synced?: boolean;
  error?: string;
}

/**
 * Sync Shrine HTTP session when the server is running — mirrors Shrine UI Awaken.
 */
export async function postShrineAwaken(
  engramId: string,
  workspaceRoot?: string,
): Promise<PostShrineAwakenResult> {
  if (!(await isShrineRunning(workspaceRoot))) {
    return { attempted: false, ok: true };
  }

  const port = shrineHttpPort();
  const url = `${shrineHttpUrl(port)}/api/awaken`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engram_id: engramId }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        attempted: true,
        ok: false,
        shrine_synced: false,
        error: payload?.error ?? `Shrine awaken failed (${response.status}).`,
      };
    }

    return { attempted: true, ok: true, shrine_synced: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      ok: false,
      shrine_synced: false,
      error: message,
    };
  }
}

/**
 * Inverse of `postShrineAwaken` — sync Shrine HTTP session when the server
 * is running, so a Cursor/Claude-Code-initiated `sleep` also clears a
 * running Shrine's display, not just the files on disk.
 */
export async function postShrineSleep(
  engramId: string,
  workspaceRoot?: string,
): Promise<PostShrineSleepResult> {
  if (!(await isShrineRunning(workspaceRoot))) {
    return { attempted: false, ok: true };
  }

  const port = shrineHttpPort();
  const url = `${shrineHttpUrl(port)}/api/sleep`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engram_id: engramId }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        attempted: true,
        ok: false,
        shrine_synced: false,
        error: payload?.error ?? `Shrine sleep failed (${response.status}).`,
      };
    }

    return { attempted: true, ok: true, shrine_synced: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      ok: false,
      shrine_synced: false,
      error: message,
    };
  }
}
