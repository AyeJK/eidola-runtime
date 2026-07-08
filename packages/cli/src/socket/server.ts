import { connect, createServer, type Server, type Socket } from 'node:net';
import { resolveVisualState } from '../vendor/tool-state.js';
import type { SessionState } from '../session/state.js';
import { resolveExpressionClip } from './expression.js';
import {
  createBroadcast,
  createClaimMessage,
  createInboundEvent,
  normalizeInbound,
  parseClaimLine,
  parseInboundLine,
  serializeBroadcast,
  serializeClaim,
  serializeInbound,
} from './protocol.js';
import {
  DEFAULT_IDLE_WATCHDOG_MS,
  DEFAULT_STATE_BUFFER_SIZE,
  DEFAULT_STATE_SOCKET_PORT,
  DEFAULT_THINKING_GRACE_MS,
  STATE_SOCKET_HOST,
  type StateBroadcast,
  type StateInboundEvent,
  type StateSocketConfig,
  type Surface,
} from './types.js';
import { VisualTurnTracker } from './visual-turn.js';

export interface StateSocketListenResult {
  host: string;
  port: number;
  /** False when port already owned (e.g. another eidola-mcp instance). MCP tools still run. */
  listening: boolean;
}

export interface StateSocketServer {
  start(): Promise<StateSocketListenResult>;
  /**
   * Like `start()`, but if another eidola-mcp instance already owns the
   * socket, asks it to release the port first ("last awakened wins") before
   * retrying. Falls back to a non-listening result if the existing owner
   * never releases in time.
   */
  claimOwnership(): Promise<StateSocketListenResult>;
  close(): Promise<void>;
  isListening(): boolean;
  broadcastState(input: {
    state: string;
    surface?: Surface;
    tool?: string;
    metadata?: Record<string, unknown>;
  }): StateBroadcast;
  getBuffer(): readonly StateBroadcast[];
}

export function createStateSocketServer(
  session: SessionState,
  config: StateSocketConfig = {},
): StateSocketServer {
  const host = config.host ?? STATE_SOCKET_HOST;
  const requestedPort = config.port ?? DEFAULT_STATE_SOCKET_PORT;
  const bufferSize = config.bufferSize ?? DEFAULT_STATE_BUFFER_SIZE;
  const warn = config.onWarn ?? defaultWarn;
  const onReassertVessel = config.onReassertVessel;
  const idleWatchdogMs = config.idleWatchdogMs ?? DEFAULT_IDLE_WATCHDOG_MS;
  const thinkingGraceMs = config.thinkingGraceMs ?? DEFAULT_THINKING_GRACE_MS;

  let server: Server | null = null;
  let listening = false;
  const clients = new Set<Socket>();
  const buffer: StateBroadcast[] = [];
  const pendingLines = new WeakMap<Socket, string>();
  const visualTurn = new VisualTurnTracker();
  let idleWatchdog: NodeJS.Timeout | null = null;
  let lastBroadcastKey: string | null = null;

  const pushBuffer = (broadcast: StateBroadcast): void => {
    buffer.push(broadcast);
    while (buffer.length > bufferSize) {
      buffer.shift();
    }
  };

  const writeBroadcast = (socket: Socket, broadcast: StateBroadcast): void => {
    if (socket.destroyed || !socket.writable) {
      return;
    }
    socket.write(serializeBroadcast(broadcast));
  };

  /**
   * Identifies a broadcast by everything the renderer actually reacts to —
   * not `ts`. Two hook events that resolve to the same animation (e.g. two
   * `PostToolUse` calls in a row, both -> thinking) shouldn't each cost a
   * fresh socket write/SSE push/clip lookup; the renderer was the only thing
   * deduping these before, and only by luck of comparing the resolved clip.
   */
  const broadcastIdentity = (broadcast: StateBroadcast): string =>
    JSON.stringify([
      broadcast.state,
      broadcast.visual_state ?? broadcast.state,
      broadcast.expression,
      broadcast.tool ?? '',
    ]);

  const emitBroadcast = (broadcast: StateBroadcast): void => {
    // The idle watchdog tracks turn staleness, not visual novelty — it must
    // keep resetting even when a repeat broadcast is deduped below.
    scheduleIdleWatchdog(broadcast.state);

    const key = broadcastIdentity(broadcast);
    if (key === lastBroadcastKey) {
      return;
    }
    lastBroadcastKey = key;

    pushBuffer(broadcast);
    for (const client of clients) {
      writeBroadcast(client, broadcast);
    }
  };

  /**
   * Forces the Vessel back to idle if a turn goes silent. Claude Code's Stop
   * hook is not guaranteed to fire when the user interrupts a turn, so without
   * this the Vessel can get stuck in thinking/working indefinitely.
   */
  const scheduleIdleWatchdog = (state: string): void => {
    if (idleWatchdog) {
      clearTimeout(idleWatchdog);
      idleWatchdog = null;
    }

    if (state === 'idle' || idleWatchdogMs <= 0) {
      return;
    }

    idleWatchdog = setTimeout(() => {
      idleWatchdog = null;
      visualTurn.reset();
      emitBroadcast(buildBroadcast('idle', Date.now()));
    }, idleWatchdogMs);
  };

  /**
   * Resolves the broadcast visual tier, applying the tool-adjacent grace
   * override: a `'thinking'` tier immediately following tool activity in
   * this turn displays as `'waiting'` first, flipping to genuine `'thinking'`
   * only if the grace timer elapses with nothing else superseding it. The
   * override is skipped for the grace-timer's own follow-up broadcast
   * (`bypassGraceOverride`), so the flip actually lands as `'thinking'`.
   *
   * Builds on top of that same mechanism for in-flight suppression (Sprint
   * 5.3.3): when the inbound event reports `tools_in_flight > 0`, a sibling
   * tool is still actually executing even though this one just finished and
   * mapped to `'thinking'` — so the fall-through to `'thinking'`/`'waiting'`
   * is suppressed entirely and the last busy tier is held instead. No second
   * timer/flag system — this reuses `lastBusyVisualState` tracking and the
   * existing grace-timer arm/cancel calls.
   */
  const resolveOverriddenVisualState = (
    state: string,
    firstToolStarted: boolean,
    bypassGraceOverride: boolean,
    toolsInFlight: number,
  ): string => {
    const visualState = resolveVisualState({ state, firstToolStarted });

    if (
      !bypassGraceOverride &&
      toolsInFlight > 0 &&
      visualState === 'thinking' &&
      visualTurn.getLastBusyVisualState()
    ) {
      // A sibling tool is still running — hold the busy tier and never even
      // arm the grace timer for this broadcast.
      visualTurn.clearGraceTimer();
      return visualTurn.getLastBusyVisualState() as string;
    }

    if (bypassGraceOverride || visualState !== 'thinking' || !firstToolStarted) {
      visualTurn.recordVisualState(visualState);
      return visualState;
    }

    visualTurn.armGraceTimer(thinkingGraceMs, () => {
      emitBroadcast(buildBroadcast('thinking', Date.now(), undefined, true, true));
    });

    visualTurn.recordVisualState('waiting');
    return 'waiting';
  };

  const buildBroadcast = (
    state: string,
    ts?: number,
    tool?: string,
    firstToolStarted = false,
    bypassGraceOverride = false,
    toolsInFlight = 0,
  ): StateBroadcast => {
    const active = session.getActive();
    const engramId = active?.engram.id ?? '';
    const visualState = resolveOverriddenVisualState(
      state,
      firstToolStarted,
      bypassGraceOverride,
      toolsInFlight,
    );
    const expression = resolveExpressionClip(visualState, active?.vessel ?? null);
    return createBroadcast(state, engramId, expression, ts ?? Date.now(), tool, visualState);
  };

  const readToolsInFlight = (metadata?: Record<string, unknown>): number => {
    const raw = metadata?.tools_in_flight;
    return typeof raw === 'number' && raw > 0 ? raw : 0;
  };

  const processInbound = (event: StateInboundEvent): StateBroadcast => {
    const normalized = normalizeInbound(event);

    if (normalized.protocolMismatch) {
      warn(
        `state socket protocol_version mismatch: expected ${event.protocol_version}; falling back to idle`,
      );
    }

    if (normalized.unknownState) {
      warn(`state socket unknown state: ${event.state}; falling back to idle`);
    }

    const firstToolStarted = visualTurn.update(
      normalized.normalizedState,
      event.metadata,
    );

    return buildBroadcast(
      normalized.normalizedState,
      event.ts,
      event.tool,
      firstToolStarted,
      false,
      readToolsInFlight(event.metadata),
    );
  };

  const shouldReassertVessel = (event: StateInboundEvent): boolean => {
    return event.metadata?.reassert_vessel === true && session.getActive() !== null;
  };

  const handleClientData = (socket: Socket, chunk: Buffer): void => {
    const existing = pendingLines.get(socket) ?? '';
    const combined = existing + chunk.toString('utf8');
    const lines = combined.split('\n');
    const pending = lines.pop() ?? '';
    pendingLines.set(socket, pending);

    for (const line of lines) {
      if (parseClaimLine(line)) {
        // A freshly-awakened instance wants the socket — "last awakened
        // wins". Release it; the claimant retries binding on its end.
        void releaseServerOnly();
        continue;
      }

      const event = parseInboundLine(line);
      if (!event) {
        if (line.trim()) {
          warn('state socket ignored malformed inbound line');
        }
        continue;
      }

      void (async () => {
        if (onReassertVessel && shouldReassertVessel(event)) {
          try {
            await onReassertVessel();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warn(`vessel reassert failed: ${message}`);
          }
        }

        const broadcast = processInbound(event);
        emitBroadcast(broadcast);
      })();
    }
  };

  const attachClient = (socket: Socket): void => {
    clients.add(socket);

    const active = session.getActive();
    for (const replay of buffer) {
      if (!active && replay.engram_id?.trim()) {
        continue;
      }
      writeBroadcast(socket, replay);
    }

    socket.on('data', (chunk) => handleClientData(socket, chunk));
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  };

  const forwardStateToExistingSocket = (state: string, surface: Surface = 'manual'): void => {
    const event = createInboundEvent(state, surface);
    const socket = connect({ host, port: requestedPort }, () => {
      socket.write(serializeInbound(event));
      socket.end();
    });
    socket.on('error', () => {
      /* silent — overlay bridge degrades without socket */
    });
  };

  /** Stops accepting connections without touching turn/dedupe state — used
   * both by a full `close()` and by claim handoff, where this instance keeps
   * running (session intact) and may reclaim the socket again later. */
  const releaseServerOnly = async (): Promise<void> => {
    for (const client of clients) {
      client.destroy();
    }
    clients.clear();

    if (!server) {
      listening = false;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
    server = null;
    listening = false;
  };

  const attemptStart = async (): Promise<StateSocketListenResult> => {
    if (server && listening) {
      const address = server.address();
      if (address && typeof address === 'object') {
        return { host: address.address, port: address.port, listening: true };
      }
    }

    server = createServer((socket) => attachClient(socket));

    let addrInUse = false;
    await new Promise<void>((resolve, reject) => {
      server!.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          addrInUse = true;
          server?.close();
          server = null;
          listening = false;
          resolve();
          return;
        }
        reject(error);
      });
      server!.listen(requestedPort, host, () => resolve());
    });

    if (addrInUse) {
      return { host, port: requestedPort, listening: false };
    }

    const address = server!.address();
    if (!address || typeof address !== 'object') {
      throw new Error('State socket failed to bind');
    }

    if (address.address !== '127.0.0.1' && address.address !== '::1') {
      throw new Error(`State socket must bind localhost only; got ${address.address}`);
    }

    listening = true;
    return { host: address.address, port: address.port, listening: true };
  };

  /**
   * Sends a claim message to whoever currently owns the socket and waits for
   * them to release it (their end closing this connection), or a short
   * timeout — whichever comes first. Best-effort: an owner that never
   * responds (e.g. a pre-claim-protocol build) just times out and the caller
   * falls back to non-owning behavior, same as before this existed.
   */
  const requestTakeover = (timeoutMs = 500): Promise<void> => {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve();
      };

      const timer = setTimeout(finish, timeoutMs);
      const socket = connect({ host, port: requestedPort }, () => {
        socket.write(serializeClaim(createClaimMessage()));
      });
      socket.on('close', finish);
      socket.on('error', finish);
    });
  };

  return {
    isListening(): boolean {
      return listening;
    },

    async start(): Promise<StateSocketListenResult> {
      const result = await attemptStart();
      if (!result.listening) {
        warn(
          `state socket ${host}:${requestedPort} already in use — MCP tools active; ` +
            'stop other eidola-mcp processes so one instance owns the socket and overlay sync.',
        );
      }
      return result;
    },

    async claimOwnership(): Promise<StateSocketListenResult> {
      if (listening) {
        return attemptStart();
      }

      await requestTakeover();

      // The owner's release is async on their end (socket teardown, then
      // server.close()'s callback) — a few short retries absorbs that race
      // without the claimant blocking for long on the common case.
      let result = await attemptStart();
      for (let attempt = 0; !result.listening && attempt < 4; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        result = await attemptStart();
      }

      if (!result.listening) {
        warn(
          `state socket ${host}:${requestedPort} claim failed — existing owner did not release; ` +
            'falling back to forwarding state to it.',
        );
      }

      return result;
    },

    async close(): Promise<void> {
      if (idleWatchdog) {
        clearTimeout(idleWatchdog);
        idleWatchdog = null;
      }
      visualTurn.clearGraceTimer();
      lastBroadcastKey = null;

      await releaseServerOnly();
    },

    broadcastState(input): StateBroadcast {
      const firstToolStarted = visualTurn.update(input.state, input.metadata);
      const broadcast = buildBroadcast(
        input.state,
        undefined,
        input.tool,
        firstToolStarted,
      );
      if (listening) {
        emitBroadcast(broadcast);
      } else {
        forwardStateToExistingSocket(input.state, input.surface ?? 'manual');
      }
      return broadcast;
    },

    getBuffer(): readonly StateBroadcast[] {
      return [...buffer];
    },
  };
}

function defaultWarn(message: string): void {
  console.error('[eidola-state-socket]', message);
}
