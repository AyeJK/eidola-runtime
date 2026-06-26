import { connect, type Socket } from 'node:net';
import {
  buildStatePayload,
  DEFAULT_STATE_SOCKET_HOST,
  resolveSocketPort,
  serializeStatePayload,
} from './payload.js';
import type { CursorVesselState } from '../state/types.js';

const RECONNECT_DELAY_MS = 2_000;

export interface StateSocketWriterOptions {
  host?: string;
  port?: number;
  reconnectDelayMs?: number;
}

export class StateSocketWriter {
  private readonly host: string;
  private readonly port: number;
  private readonly reconnectDelayMs: number;

  private socket: Socket | null = null;
  private connecting = false;
  private disposed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastState: CursorVesselState | null = null;

  constructor(options: StateSocketWriterOptions = {}) {
    this.host = options.host ?? DEFAULT_STATE_SOCKET_HOST;
    this.port = options.port ?? resolveSocketPort();
    this.reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;
  }

  emit(state: CursorVesselState, tool?: string): void {
    if (this.disposed) {
      return;
    }

    this.lastState = state;
    const line = serializeStatePayload(buildStatePayload(state, { tool }));

    if (!this.isWritable()) {
      this.scheduleReconnect();
      return;
    }

    try {
      this.socket?.write(line);
    } catch {
      this.handleDisconnect();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    this.socket?.destroy();
    this.socket = null;
  }

  private isWritable(): boolean {
    return Boolean(this.socket && !this.socket.destroyed && this.socket.writable);
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.connecting || this.reconnectTimer) {
      return;
    }

    this.connecting = true;
    const socket = connect({ host: this.host, port: this.port });

    socket.once('connect', () => {
      this.connecting = false;
      this.socket = socket;
      this.attachSocketHandlers(socket);
      this.resumeLastState();
    });

    socket.once('error', () => {
      this.connecting = false;
      socket.destroy();
      this.queueReconnect();
    });
  }

  private attachSocketHandlers(socket: Socket): void {
    socket.on('error', () => {
      this.handleDisconnect();
    });

    socket.on('close', () => {
      this.handleDisconnect();
    });
  }

  private handleDisconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    this.queueReconnect();
  }

  private queueReconnect(): void {
    if (this.disposed || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.scheduleReconnect();
    }, this.reconnectDelayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private resumeLastState(): void {
    if (!this.lastState || !this.isWritable()) {
      return;
    }

    const line = serializeStatePayload(buildStatePayload(this.lastState));
    try {
      this.socket?.write(line);
    } catch {
      this.handleDisconnect();
    }
  }
}
