import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { EidolaPaths } from '../config.js';
import { EngramLoadError } from '../engram/types.js';
import type { SessionState } from '../session/state.js';

const DEBOUNCE_MS = 250;

export interface FilesystemWatchHandle {
  close(): void;
}

export function watchEidolaPaths(
  paths: EidolaPaths,
  session: SessionState,
  onReload?: (reason: string) => void,
): FilesystemWatchHandle {
  const watchers: FSWatcher[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const scheduleReload = (label: string, directory: string) => {
    const key = `${label}:${directory}`;
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void reloadActive(session, onReload, `${label} change in ${directory}`);
      }, DEBOUNCE_MS),
    );
  };

  for (const directory of [paths.engramsDir, paths.vesselsDir]) {
    try {
      const watcher = watch(directory, { recursive: true }, (_event, filename) => {
        if (!filename) {
          scheduleReload('directory', directory);
          return;
        }

        scheduleReload('file', join(directory, filename.toString()));
      });

      watcher.on('error', () => {
        // Non-fatal — watcher may fail on some platforms for recursive watch.
      });

      watchers.push(watcher);
    } catch {
      // Directory may not exist yet; server still runs.
    }
  }

  return {
    close() {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}

async function reloadActive(
  session: SessionState,
  onReload: ((reason: string) => void) | undefined,
  reason: string,
): Promise<void> {
  const active = session.getActive();
  if (!active) {
    return;
  }

  try {
    await session.reloadActive();
    onReload?.(reason);
  } catch (error) {
    if (error instanceof EngramLoadError) {
      onReload?.(`hot-reload failed: ${error.message}`);
      return;
    }

    onReload?.(`hot-reload failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
