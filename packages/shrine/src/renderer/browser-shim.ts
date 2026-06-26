import type { ShrineApi } from '../shared/shrine-api.js';
import type { ShrineStatePayload, ShrineSurfacePayload, ShrineVesselConfig } from '../shared/types.js';

type MessageHandler<T> = (payload: T) => void;

interface ShrineSseMessage {
  type: 'state' | 'vessel-config' | 'surface' | 'awakened' | 'asleep';
  payload: unknown;
}

function shrineBasePath(): string {
  const path = window.location.pathname.replace(/\/$/, '');
  if (path.endsWith('/index.html')) {
    return path.slice(0, -'/index.html'.length);
  }
  return path || '/shrine';
}

function shrineEventsPath(): string {
  return `${shrineBasePath()}/events`;
}

function shrineReadyPath(): string {
  return `${shrineBasePath()}/ready`;
}

export function installBrowserShrineApi(): ShrineApi {
  const stateHandlers = new Set<MessageHandler<ShrineStatePayload>>();
  const vesselHandlers = new Set<MessageHandler<ShrineVesselConfig>>();
  const surfaceHandlers = new Set<MessageHandler<ShrineSurfacePayload>>();
  const awakenedHandlers = new Set<MessageHandler<{ engram_id: string }>>();
  const asleepHandlers = new Set<MessageHandler<{ engram_id: string }>>();

  const source = new EventSource(shrineEventsPath());

  source.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as ShrineSseMessage;
      if (message.type === 'state') {
        for (const handler of stateHandlers) {
          handler(message.payload as ShrineStatePayload);
        }
      } else if (message.type === 'vessel-config') {
        for (const handler of vesselHandlers) {
          handler(message.payload as ShrineVesselConfig);
        }
      } else if (message.type === 'surface') {
        for (const handler of surfaceHandlers) {
          handler(message.payload as ShrineSurfacePayload);
        }
      } else if (message.type === 'awakened') {
        for (const handler of awakenedHandlers) {
          handler(message.payload as { engram_id: string });
        }
      } else if (message.type === 'asleep') {
        for (const handler of asleepHandlers) {
          handler(message.payload as { engram_id: string });
        }
      }
    } catch {
      // ignore malformed SSE payloads
    }
  };

  const api: ShrineApi = {
    onState(handler) {
      stateHandlers.add(handler);
      return () => stateHandlers.delete(handler);
    },
    onVesselConfig(handler) {
      vesselHandlers.add(handler);
      return () => vesselHandlers.delete(handler);
    },
    onSurface(handler) {
      surfaceHandlers.add(handler);
      return () => surfaceHandlers.delete(handler);
    },
    onAwakened(handler) {
      awakenedHandlers.add(handler);
      return () => awakenedHandlers.delete(handler);
    },
    onAsleep(handler) {
      asleepHandlers.add(handler);
      return () => asleepHandlers.delete(handler);
    },
    ready() {
      void fetch(shrineReadyPath(), { method: 'POST' }).catch(() => {
        // server may still be starting
      });
    },
    log(message: string) {
      console.log('[eidola-shrine:browser]', message);
    },
  };

  window.eidolaShrine = api;
  return api;
}

/** True when Electron preload already exposed the IPC bridge. */
export function hasElectronShrineApi(): boolean {
  return Boolean((window as Window & { eidolaShrine?: ShrineApi }).eidolaShrine?.onState);
}
