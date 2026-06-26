#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveEidolaRuntimeConfig } from './config.js';
import { autoActivateFromWorkspace } from './cursor/auto-activate.js';
import { writeWorkspaceRegistry } from './workspace-registry.js';
import { SessionState } from './session/state.js';
import { createStateSocketServer } from './socket/server.js';
import { createToolHandlers } from './tools/handlers.js';
import { registerEidolaTools } from './tools/register.js';
import { watchEidolaPaths } from './watch/filesystem.js';
import { watchMcpAwakenSignal } from './watch/mcp-awaken.js';

const SERVER_NAME = 'eidola';
const SERVER_VERSION = '0.3.0';

function debug(...args: unknown[]): void {
  console.error('[eidola-mcp]', ...args);
}

export async function startEidolaMcpServer(): Promise<{
  close: () => Promise<void>;
}> {
  const config = resolveEidolaRuntimeConfig();
  const session = new SessionState();

  if (config.workspaceRoot) {
    try {
      await writeWorkspaceRegistry(config.workspaceRoot);
    } catch (error) {
      debug('workspace registry write failed:', error);
    }
  }

  let stateSocket: ReturnType<typeof createStateSocketServer>;
  stateSocket = createStateSocketServer(session, {
    host: config.stateSocketHost,
    port: config.stateSocketPort,
    bufferSize: config.stateBufferSize,
    onWarn: (message) => debug(message),
    onReassertVessel: async () => {
      const reloaded = await session.reloadActive();
      if (!reloaded || !stateSocket.isListening()) {
        return;
      }
      stateSocket.broadcastState({ state: 'idle' });
    },
  });
  const socketAddress = await stateSocket.start();
  const handlers = createToolHandlers(config, session, stateSocket);

  if (socketAddress.listening) {
    const activation = await autoActivateFromWorkspace(config, session, stateSocket, (message) =>
      debug(message),
    );
    if (activation.activated) {
      debug(
        'auto-activate:',
        activation.engramId,
        activation.alreadyActive ? '(already active)' : '(loaded)',
      );
    } else if (activation.error) {
      debug('auto-activate skipped:', activation.error);
    }
  }

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions:
        'Eidola MCP server — launch_shrine opens the display; awaken binds an Engram and shows its Vessel. ' +
        'Local-only; no remote API proxy.',
    },
  );

  registerEidolaTools(server, handlers);

  // TEMPORARY (Sprint 5.2.2 Task 6) — client-detect.ts's CURSOR_CLIENT_NAMES
  // and CLAUDE_CODE_CLIENT_NAMES are still unverified guesses (see comment
  // there). This logs the real clientInfo from the MCP `initialize`
  // handshake so a human running one real Cursor session and one real
  // Claude Code session can capture the literal values and report them
  // back. Remove once client-detect.ts is updated with confirmed values
  // (Sprint 5.2.2 Task 7).
  server.server.oninitialized = () => {
    const clientVersion = server.server.getClientVersion();
    debug('[diagnostic][clientInfo.name]', clientVersion?.name);
    debug('[diagnostic][clientInfo full]', JSON.stringify(clientVersion));
  };

  const watcher = watchEidolaPaths(config, session, (reason) => {
    debug('hot-reload:', reason);
  });

  const awakenWatcher = watchMcpAwakenSignal(config, session, stateSocket, (message) =>
    debug(message),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  debug('stdio transport connected');
  debug('engrams:', config.engramsDir);
  debug('vessels:', config.vesselsDir);
  if (config.workspaceRoot) {
    debug('workspace:', config.workspaceRoot);
  }
  if (socketAddress.listening) {
    debug('state socket:', `${socketAddress.host}:${socketAddress.port}`);
  } else {
    debug(
      'state socket: not bound (port in use) — MCP tools OK; free port',
      config.stateSocketPort,
      'for overlay sync',
    );
  }

  const close = async () => {
    awakenWatcher.close();
    watcher.close();
    await stateSocket.close();
    await server.close();
  };

  return { close };
}

async function main(): Promise<void> {
  const { close } = await startEidolaMcpServer();

  const shutdown = async (signal: string) => {
    debug(`${signal} received, shutting down...`);
    await close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

import { pathToFileURL } from 'node:url';

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    debug('Fatal error:', error);
    process.exit(1);
  });
}
