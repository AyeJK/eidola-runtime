import { connect, type Socket } from 'node:net';
import type { StateBroadcast } from '../vendor/mcp.js';

export type BroadcastHandler = (broadcast: StateBroadcast) => void;

export interface StateSocketClientOptions {
  host?: string;
  port: number;
  onBroadcast: BroadcastHandler;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectMs?: number;
}

export class StateSocketClient {
  private readonly host: string;
  private readonly port: number;
  private readonly onBroadcast: BroadcastHandler;
  private readonly onConnect?: () => void;
  private readonly onDisconnect?: () => void;
  private readonly reconnectMs: number;

  private socket: Socket | null = null;
  private pending = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(options: StateSocketClientOptions) {
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port;
    this.onBroadcast = options.onBroadcast;
    this.onConnect = options.onConnect;
    this.onDisconnect = options.onDisconnect;
    this.reconnectMs = options.reconnectMs ?? 2000;
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.destroy();
    this.socket = null;
  }

  private connect(): void {
    if (this.closed) {
      return;
    }

    const socket = connect({ host: this.host, port: this.port });
    this.socket = socket;

    socket.on('connect', () => {
      this.onConnect?.();
    });

    socket.on('data', (chunk) => {
      this.handleData(chunk.toString('utf8'));
    });

    socket.on('close', () => {
      this.socket = null;
      this.onDisconnect?.();
      this.scheduleReconnect();
    });

    socket.on('error', () => {
      socket.destroy();
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectMs);
  }

  private handleData(chunk: string): void {
    this.pending += chunk;
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';

    for (const line of lines) {
      const broadcast = parseBroadcastLine(line);
      if (broadcast) {
        this.onBroadcast(broadcast);
      }
    }
  }
}

export function parseBroadcastLine(line: string): StateBroadcast | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Partial<StateBroadcast>;
    if (
      typeof parsed.protocol_version !== 'string' ||
      typeof parsed.ts !== 'number' ||
      typeof parsed.state !== 'string' ||
      typeof parsed.engram_id !== 'string' ||
      typeof parsed.expression !== 'string'
    ) {
      return null;
    }

    return {
      protocol_version: parsed.protocol_version,
      ts: parsed.ts,
      state: parsed.state,
      engram_id: parsed.engram_id,
      expression: parsed.expression,
      ...(typeof parsed.tool === 'string' ? { tool: parsed.tool } : {}),
    };
  } catch {
    return null;
  }
}
