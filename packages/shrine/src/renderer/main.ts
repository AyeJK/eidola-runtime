import { resolveVisualState } from '@eidola/tool-state';
import { VesselPlayer } from './vessel-player.js';
import { ApprovalIdleController } from './approval-idle-controller.js';
import { SuccessHoldController } from './success-hold-controller.js';
import { installBrowserShrineApi, hasElectronShrineApi } from './browser-shim.js';
import { mountShrineAtmosphere } from './shrine-atmosphere.js';
import {
  applyKrakenPresentation,
  mountShrineSetupPage,
  type ShrineSetupController,
} from './shrine-settings.js';
import { getShrineHudSettings, applyShrineHudSettings } from './shrine-hud-settings.js';
import '../shared/shrine-api.js';
import { detectKrakenMode, resolveBrowserShrineSurface } from '../shared/kraken-detect.js';
import { shrineColorForState } from '../shared/shrine-state-colors.js';
import { pickShrineHudSubtitle } from '../shared/shrine-hud-subtitles.js';
import { toolHudLabel } from '../shared/shrine-tool-labels.js';
import type { ShrineStatePayload, ShrineSurfacePayload, ShrineVesselConfig } from '../shared/types.js';
import type { ShrineSurface } from '../shared/shrine-surface.js';

// Apply persisted HUD theme/enabled state synchronously, before bootstrap/render,
// so the HUD never flashes the default theme on load.
applyShrineHudSettings(getShrineHudSettings());

const DEFAULT_CONFIG: ShrineVesselConfig = {
  rendererType: 'lottie',
  pack: '',
  idleClip: '',
  crossfadeMs: 300,
  idleLoops: true,
  approvalIdleMs: 3000,
  successHoldMs: 3000,
  minHoldMs: 1000,
};

let vesselConfig: ShrineVesselConfig = DEFAULT_CONFIG;
let cachedIdlePayload: ShrineStatePayload | null = null;
let activeSurface: ShrineSurface | null = null;
let setupController: ShrineSetupController | null = null;
let browserAwakened = false;
  let shrineReadySent = false;
  let pendingAwakenRender = false;

async function bootstrap(): Promise<boolean> {
  if (hasElectronShrineApi()) {
    return true;
  }

  mountShrineAtmosphere();

  const detection = detectKrakenMode();
  installBrowserShrineApi();

  if (detection.isKrakenBrowser) {
    const surface = resolveBrowserShrineSurface(detection);
    activeSurface = surface;
    applyKrakenPresentation(surface);
    return true;
  }

  setupController = mountShrineSetupPage({
    onAwaken: async ({ engramId }) => {
      await awakenBrowserShrine(engramId);
    },
    onSleep: async ({ engramId }) => {
      await sleepBrowserShrine(engramId);
    },
    onView: ({ engramId }) => {
      viewBrowserShrine(engramId);
    },
  });

  void loadInitialActiveEngram();

  return true;
}

async function loadInitialActiveEngram(): Promise<void> {
  try {
    const response = await fetch('/shrine/api/active');
    if (!response.ok) {
      return;
    }
    const payload = (await response.json().catch(() => null)) as { engram_id?: string | null } | null;
    setupController?.setActiveEngramId(payload?.engram_id ?? null);
  } catch {
    // offline or Shrine session not ready — stay with no active badge
  }
}

function showVesselView(): void {
  document.querySelector<HTMLElement>('[data-shrine-vessel]')?.classList.remove('hidden');
  setupController?.hide();
  document.documentElement.classList.add('shrine-awakened');
}

function showCursorLinkBanner(message: string | null): void {
  const banner = document.querySelector<HTMLElement>('[data-cursor-link-banner]');
  if (!banner) {
    return;
  }

  if (message) {
    banner.textContent = message;
    banner.classList.remove('hidden');
  } else {
    banner.textContent = '';
    banner.classList.add('hidden');
  }
}

function hideVesselView(): void {
  document.querySelector<HTMLElement>('[data-shrine-vessel]')?.classList.add('hidden');
  setupController?.show();
}

async function awakenBrowserShrine(engramId: string): Promise<void> {
  const response = await fetch('/shrine/api/awaken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      engram_id: engramId,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    const message = payload?.error ?? `Awaken failed (${response.status}).`;
    setupController?.showSetupMessage(message);
    console.error('[eidola-shrine]', message);
    return;
  }

  const payload = (await response.json().catch(() => null)) as {
    cursor_linked?: boolean;
    cursor_link_error?: string;
  } | null;

  if (payload && payload.cursor_linked === false && payload.cursor_link_error) {
    showCursorLinkBanner(payload.cursor_link_error);
  } else {
    showCursorLinkBanner(null);
  }

  browserAwakened = true;
  setupController?.notifyAwakened();
  setupController?.setActiveEngramId(engramId);
  showVesselView();
  window.dispatchEvent(new Event('shrine-awakened'));
}

/** Inverse of `awakenBrowserShrine` — POSTs `/shrine/api/sleep`, clears local awakened state. */
async function sleepBrowserShrine(engramId: string): Promise<void> {
  const response = await fetch('/shrine/api/sleep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      engram_id: engramId,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    const message = payload?.error ?? `Sleep failed (${response.status}).`;
    setupController?.showSetupMessage(message);
    console.error('[eidola-shrine]', message);
    return;
  }

  setupController?.setActiveEngramId(null);
  browserAwakened = false;
  document.documentElement.classList.remove('shrine-awakened');
  hideVesselView();
}

/** Re-shows the vessel for an already-awake engram without re-POSTing /shrine/api/awaken. */
function viewBrowserShrine(engramId: string): void {
  browserAwakened = true;
  setupController?.notifyAwakened();
  setupController?.setActiveEngramId(engramId);
  showVesselView();
  window.dispatchEvent(new Event('shrine-awakened'));
}

function returnBrowserToSetup(): void {
  if (!browserAwakened) {
    return;
  }
  browserAwakened = false;
  hideVesselView();
  window.dispatchEvent(new Event('shrine-return-setup'));
}

if (await bootstrap()) {
  runShrine();
}

function runShrine(): void {
  const stageEl = document.querySelector<HTMLElement>('.vessel-stage');
  if (!stageEl) {
    throw new Error('Missing vessel stage');
  }
  const stage = stageEl;

  const player = new VesselPlayer(stage);
  const approvalIdle = new ApprovalIdleController((payload) => {
    void onIncomingState(payload);
  });
  approvalIdle.setConfig(vesselConfig);
  const successHold = new SuccessHoldController(() => {
    void transitionToIdle();
  });
  successHold.setConfig(vesselConfig);
  const hudEl = document.querySelector<HTMLElement>('[data-shrine-hud]');
  const hudStateWordEl = document.querySelector<HTMLElement>('[data-shrine-hud-state-word]');
  const hudStateSubEl = document.querySelector<HTMLElement>('[data-shrine-hud-state-sub]');
  const hudToolEl = document.querySelector<HTMLElement>('[data-shrine-hud-tool]');
  const hudToolLabelEl = document.querySelector<HTMLElement>('[data-shrine-hud-tool-label]');
  const detection = detectKrakenMode();
  let localFirstToolStarted = false;
  let lastGatedPayload: ShrineStatePayload | null = null;
  let hudSubtitleTier: string | null = null;
  let hudSubtitleText = '';
  let hudSubtitleTimer: ReturnType<typeof setInterval> | null = null;
  const HUD_SUBTITLE_ROTATE_MS = 4000;

  function ensureKrakenPresentation(): void {
    if (!detection.isKrakenBrowser) {
      return;
    }

    const surface = resolveBrowserShrineSurface(detection);
    activeSurface = surface;
    applyKrakenPresentation(surface);
  }

  function markKrakenEngramActive(engramId?: string): void {
    if (!detection.isKrakenBrowser) {
      return;
    }

    if (engramId !== undefined && !engramId.trim()) {
      return;
    }

    ensureKrakenPresentation();
    showVesselView();
  }

  function syncLocalTurnLock(broadcast: ShrineStatePayload['broadcast']): void {
    if (broadcast.visual_state) {
      if (broadcast.visual_state === 'working') {
        localFirstToolStarted = true;
      } else if (broadcast.state === 'idle' || broadcast.state === 'success') {
        localFirstToolStarted = false;
      } else if (broadcast.visual_state === 'thinking' && broadcast.state === 'thinking') {
        localFirstToolStarted = false;
      }
      return;
    }

    if (broadcast.state === 'idle' || broadcast.state === 'success') {
      localFirstToolStarted = false;
    } else if (broadcast.state === 'searching' || broadcast.state === 'writing' || broadcast.state === 'working') {
      localFirstToolStarted = true;
    }
  }

  function resolveVisualTier(broadcast: ShrineStatePayload['broadcast']): string {
    syncLocalTurnLock(broadcast);
    return (
      broadcast.visual_state ??
      resolveVisualState({
        state: broadcast.state,
        firstToolStarted: localFirstToolStarted,
      })
    );
  }

  if (detection.isKrakenBrowser) {
    // Kraken's circular LCD gets no HUD in this phase — deferred to Phase 2.2.
    hudEl?.remove();
  }

  async function transitionToIdle(): Promise<void> {
    applyShrineBackground('idle');
    if (!cachedIdlePayload) {
      return;
    }
    const payload: ShrineStatePayload = { ...cachedIdlePayload, source: 'fallback' };
    setHud(payload, resolveVisualTier(payload.broadcast));
    await player.play(payload, vesselConfig);
  }

  player.setAutoIdleHandler(() => transitionToIdle());

  function applyHudSubtitle(sub: string): void {
    hudSubtitleText = sub;
    if (hudStateSubEl) {
      hudStateSubEl.textContent = sub;
      hudStateSubEl.classList.toggle('hidden', !sub);
    }
  }

  function setHud(payload: ShrineStatePayload, visualTier: string): void {
    if (!hudEl) {
      return;
    }

    const { tool } = payload.broadcast;

    if (hudStateWordEl) {
      hudStateWordEl.textContent = visualTier;
      hudStateWordEl.style.color = shrineColorForState(visualTier);
    }

    if (hudStateSubEl) {
      if (visualTier !== hudSubtitleTier) {
        hudSubtitleTier = visualTier;
        applyHudSubtitle(pickShrineHudSubtitle(visualTier));

        if (hudSubtitleTimer !== null) {
          clearInterval(hudSubtitleTimer);
        }
        hudSubtitleTimer = setInterval(() => {
          applyHudSubtitle(pickShrineHudSubtitle(visualTier, hudSubtitleText));
        }, HUD_SUBTITLE_ROTATE_MS);
      }
    }

    if (hudToolEl && hudToolLabelEl) {
      if (tool) {
        hudToolLabelEl.textContent = toolHudLabel(tool);
        hudToolEl.classList.remove('hidden');
      } else {
        hudToolLabelEl.textContent = '';
        hudToolEl.classList.add('hidden');
      }
    }
  }

  function applyShrineBackground(state: string): void {
    if (detection.isKrakenBrowser) {
      document.documentElement.style.setProperty('--shrine-bg', '#000000');
      return;
    }

    const color = shrineColorForState(state);
    document.documentElement.style.setProperty('--shrine-bg', color);
  }

  function shouldRenderVessel(): boolean {
    return detection.isKrakenBrowser || browserAwakened;
  }

  async function onIncomingState(payload: ShrineStatePayload): Promise<void> {
    if (payload.broadcast.engram_id) {
      approvalIdle.setEngramId(payload.broadcast.engram_id);
      markKrakenEngramActive(payload.broadcast.engram_id);
    }
    approvalIdle.onState(payload);

    const gated = successHold.filter(payload);
    if (!gated) {
      return;
    }

    lastGatedPayload = gated;

    if (gated.broadcast.state === 'idle') {
      cachedIdlePayload = gated;
      player.setIdlePayload(gated);
    }

    if (!shouldRenderVessel()) {
      if (pendingAwakenRender && browserAwakened) {
        pendingAwakenRender = false;
      } else {
        return;
      }
    }

    applyShrineBackground(gated.broadcast.state);

    const visualTier = resolveVisualTier(gated.broadcast);
    setHud(gated, visualTier);

    window.eidolaShrine.log(
      `[renderer] onIncomingState state=${gated.broadcast.state} visual=${visualTier} source=${gated.source}`,
    );

    const visualPayload: ShrineStatePayload = {
      ...gated,
      broadcast: {
        ...gated.broadcast,
        visual_state: visualTier,
      },
    };
    await player.play(visualPayload, vesselConfig);
  }

  window.eidolaShrine.onVesselConfig((config: ShrineVesselConfig) => {
    window.eidolaShrine.log(
      `[renderer] vesselConfig received rendererType=${config.rendererType} pack=${config.pack}`,
    );
    vesselConfig = config;
    player.setConfig(config);
    approvalIdle.setConfig(config);
    successHold.setConfig(config);

    if (detection.isKrakenBrowser) {
      markKrakenEngramActive();
    }
  });

  window.eidolaShrine.onSurface((payload: ShrineSurfacePayload) => {
    if (detection.isKrakenBrowser) {
      ensureKrakenPresentation();
      window.eidolaShrine.log(
        `[renderer] kraken surface locked ${activeSurface?.preset ?? 'kraken-elite-v2'} ${activeSurface?.width ?? 640}×${activeSurface?.height ?? 640}`,
      );
      applyShrineBackground('idle');
      return;
    }

    if (!payload.surface.circularMask) {
      if (!browserAwakened) {
        return;
      }
      activeSurface = payload.surface;
      document.documentElement.dataset.shrineSurface = payload.surface.preset;
      document.documentElement.dataset.shrineWidth = String(payload.surface.width);
      document.documentElement.dataset.shrineHeight = String(payload.surface.height);
    }

    window.eidolaShrine.log(
      `[renderer] active surface ${payload.surface.preset} ${payload.surface.width}×${payload.surface.height}`,
    );
    applyShrineBackground('idle');
  });

  function replayAwakenedState(): boolean {
    const payload = lastGatedPayload ?? cachedIdlePayload;
    if (!payload) {
      return false;
    }
    void onIncomingState(payload);
    return true;
  }

  window.addEventListener('shrine-awakened', () => {
    if (!replayAwakenedState()) {
      pendingAwakenRender = true;
      requestShrineBootstrap();
    }
  });

  if (!detection.isKrakenBrowser) {
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !browserAwakened) {
        return;
      }
      event.preventDefault();
      if (setupController?.isEscapeOverlayVisible()) {
        setupController.hideEscapeOverlay();
        return;
      }
      setupController?.showEscapeOverlay();
    });

    window.addEventListener('shrine-request-return', () => {
      returnBrowserToSetup();
    });
  }

  function signalShrineReady(): void {
    if (shrineReadySent) {
      return;
    }
    shrineReadySent = true;
    requestShrineBootstrap();
  }

  function requestShrineBootstrap(): void {
    window.eidolaShrine.ready();
  }

  window.eidolaShrine.onState((payload: ShrineStatePayload) => {
    void onIncomingState(payload);
  });

  window.eidolaShrine.onAwakened((payload) => {
    setupController?.setActiveEngramId(payload.engram_id);

    if (detection.isKrakenBrowser) {
      markKrakenEngramActive(payload.engram_id);
      if (!replayAwakenedState()) {
        pendingAwakenRender = true;
        requestShrineBootstrap();
      }
      return;
    }

    if (browserAwakened) {
      return;
    }
    browserAwakened = true;
    setupController?.notifyAwakened();
    showVesselView();
    window.dispatchEvent(new Event('shrine-awakened'));
    if (!replayAwakenedState()) {
      pendingAwakenRender = true;
      requestShrineBootstrap();
    }
  });

  window.eidolaShrine.onAsleep(() => {
    setupController?.setActiveEngramId(null);

    if (detection.isKrakenBrowser) {
      return;
    }
    browserAwakened = false;
    document.documentElement.classList.remove('shrine-awakened');
    hideVesselView();
  });

  signalShrineReady();
}
