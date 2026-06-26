import { watch, type FSWatcher } from 'node:fs';
import { resolve } from 'node:path';
import type { EidolaRuntimeConfig } from '../config.js';
import { detectSoulSource } from '../cursor/soul-source.js';
import { readMcpAwakenSignal, mcpAwakenSignalPath } from '../cursor/mcp-awaken-signal.js';
import { EngramLoadError } from '../engram/types.js';
import type { SessionState } from '../session/state.js';
import type { StateSocketServer } from '../socket/server.js';

const DEBOUNCE_MS = 150;

export interface McpAwakenWatchHandle {
  close(): void;
}

function workspaceRootsMatch(a: string, b: string): boolean {
  const left = resolve(a);
  const right = resolve(b);
  if (process.platform === 'win32') {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

export function watchMcpAwakenSignal(
  config: EidolaRuntimeConfig,
  session: SessionState,
  stateSocket: StateSocketServer,
  onWarn: (message: string) => void = defaultWarn,
): McpAwakenWatchHandle {
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastTs = 0;

  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void handleSignal();
    }, DEBOUNCE_MS);
  };

  const handleSignal = async () => {
    const signal = await readMcpAwakenSignal();
    if (!signal || signal.ts <= lastTs) {
      return;
    }

    if (
      !config.workspaceRoot ||
      !workspaceRootsMatch(config.workspaceRoot, signal.workspace_root)
    ) {
      return;
    }

    lastTs = signal.ts;

    const directory = signal.engram_directory;

    try {
      const soulSource = await detectSoulSource(signal.workspace_root, signal.engram_id);
      await session.load(directory, soulSource);
      if (stateSocket.isListening()) {
        stateSocket.broadcastState({ state: 'idle', surface: 'manual' });
      }
    } catch (error) {
      if (error instanceof EngramLoadError) {
        onWarn(`mcp-awaken: ${error.message}`);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      onWarn(`mcp-awaken failed: ${message}`);
    }
  };

  try {
    watcher = watch(mcpAwakenSignalPath(), () => {
      schedule();
    });
    watcher.on('error', () => {
      // Non-fatal — file may not exist until first Awaken.
    });
  } catch {
    // Config dir may not exist yet.
  }

  void handleSignal();

  return {
    close() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      watcher?.close();
      watcher = null;
    },
  };
}

function defaultWarn(message: string): void {
  console.error('[eidola-mcp]', message);
}
