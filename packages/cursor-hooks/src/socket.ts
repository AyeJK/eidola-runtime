import { connect, type Socket } from 'node:net';
import {
  buildStatePayload,
  DEFAULT_STATE_SOCKET_HOST,
  resolveSocketPort,
  serializeStatePayload,
} from './payload.js';
import type { HookStateMapping } from './types.js';

export interface SendStateOptions {
  host?: string;
  port?: number;
  ts?: number;
}

export function sendStateToSocket(
  mapping: HookStateMapping,
  options: SendStateOptions = {},
): Promise<void> {
  const payload = buildStatePayload(mapping.state, {
    ts: options.ts,
    tool: mapping.tool,
    metadata: mapping.metadata,
  });
  const line = serializeStatePayload(payload);
  const host = options.host ?? DEFAULT_STATE_SOCKET_HOST;
  const port = options.port ?? resolveSocketPort();

  return new Promise((resolve) => {
    let socket: Socket | undefined;
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      socket?.removeAllListeners();
      socket?.destroy();
      resolve();
    };

    try {
      socket = connect({ host, port });
    } catch {
      finish();
      return;
    }

    socket.setTimeout(500);
    socket.once('connect', () => {
      try {
        socket?.write(line, finish);
      } catch {
        finish();
      }
    });
    socket.once('error', finish);
    socket.once('timeout', finish);
    socket.once('close', finish);
  });
}
