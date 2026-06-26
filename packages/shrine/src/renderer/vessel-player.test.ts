import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VesselPlayer } from './vessel-player.js';
import type { ShrineStatePayload, ShrineVesselConfig } from '../shared/types.js';

/**
 * `VesselPlayer` drives real DOM/canvas/lottie playback, which is out of
 * scope for this unit — these tests only exercise the `pendingPlay`
 * priority logic via `play()`'s min-hold branch, by reaching into the
 * private `pendingPlay` field directly. That's the only way to observe
 * `setPendingPlay()`'s decision without standing up the full clip-loading
 * pipeline (fetch/lottie/webm), none of which is relevant to this sprint.
 */

function makeConfig(): ShrineVesselConfig {
  return {
    rendererType: 'lottie',
    pack: 'test-pack',
    idleClip: 'idle.json',
    crossfadeMs: 300,
    idleLoops: true,
    approvalIdleMs: 3000,
    successHoldMs: 3000,
    minHoldMs: 1000,
  };
}

function makePayload(state: string, visualState?: string): ShrineStatePayload {
  return {
    broadcast: {
      protocol_version: '1.0',
      ts: Date.now(),
      state,
      engram_id: 'test-engram',
      expression: state,
      visual_state: visualState,
    },
    clipUrl: `eidola://vessel/test-pack/${state}.json`,
    loop: true,
    returnToIdle: false,
    source: 'socket',
  };
}

function getPendingTier(player: VesselPlayer): string | null {
  const pending = (player as unknown as { pendingPlay: { payload: ShrineStatePayload } | null })
    .pendingPlay;
  if (!pending) {
    return null;
  }
  return pending.payload.broadcast.visual_state ?? pending.payload.broadcast.state;
}

/**
 * No DOM environment is configured for this package's vitest run (node, not
 * jsdom) — `VesselPlayer`'s constructor only needs `root.querySelector` to
 * resolve three elements and to set their `.style.opacity`, so a minimal
 * stub covers that without pulling in jsdom as a new dependency.
 */
function makeStubElement(): HTMLElement {
  return { style: { setProperty: () => {} } } as unknown as HTMLElement;
}

function makeStubRoot(): HTMLElement {
  const halo = makeStubElement();
  const layerA = makeStubElement();
  const layerB = makeStubElement();
  const elements: Record<string, HTMLElement> = {
    '.vessel-halo': halo,
    '.vessel-layer-a': layerA,
    '.vessel-layer-b': layerB,
  };
  return {
    querySelector: (selector: string) => elements[selector] ?? null,
    style: { setProperty: () => {} },
  } as unknown as HTMLElement;
}

describe('VesselPlayer pendingPlay priority', () => {
  let root: HTMLElement;
  let player: VesselPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    // This package's vitest run uses the `node` environment (no `window`
    // global), but `play()`'s min-hold branch calls `window.setTimeout` —
    // stub the minimum surface `VesselPlayer` touches in the path under
    // test rather than pulling in jsdom for one global.
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    root = makeStubRoot();
    player = new VesselPlayer(root);
    player.setConfig(makeConfig());

    // Force `play()` into the min-hold branch: a fresh player's
    // `currentStateStartedAt` is 0, so `performance.now() - 0` will always
    // be >= minHoldMs in real time. Stamp it to "now" so the first call in
    // each test takes the min-hold path instead of falling through to
    // `playInternal` (which needs `fetch`/lottie wiring this suite doesn't
    // set up).
    (player as unknown as { currentStateStartedAt: number }).currentStateStartedAt =
      performance.now();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not let an incoming "thinking" payload overwrite a pending tool-aware payload', () => {
    player.play(makePayload('searching'), makeConfig());
    expect(getPendingTier(player)).toBe('searching');

    player.play(makePayload('thinking'), makeConfig());

    expect(getPendingTier(player)).toBe('searching');
  });

  it('lets a newer tool-aware payload replace an already-pending tool-aware payload', () => {
    player.play(makePayload('searching'), makeConfig());
    expect(getPendingTier(player)).toBe('searching');

    player.play(makePayload('writing'), makeConfig());

    expect(getPendingTier(player)).toBe('writing');
  });

  it.each(['error', 'success', 'idle', 'attention'])(
    'still lets an incoming %s payload replace a pending "thinking" payload',
    (incomingState) => {
      player.play(makePayload('thinking'), makeConfig());
      expect(getPendingTier(player)).toBe('thinking');

      player.play(makePayload(incomingState), makeConfig());

      expect(getPendingTier(player)).toBe(incomingState);
    },
  );

  it('lets an incoming "thinking" payload replace a pending "thinking" payload (unaffected case)', () => {
    player.play(makePayload('thinking'), makeConfig());
    expect(getPendingTier(player)).toBe('thinking');

    player.play(makePayload('thinking'), makeConfig());

    expect(getPendingTier(player)).toBe('thinking');
  });

  it('honors visual_state over semantic state when present on both incoming and pending payloads', () => {
    // Semantic state can differ from the visual tier (e.g. semantic
    // `searching` broadcasting visual `working`); the guard must compare
    // visual tiers, not raw `state`.
    player.play(makePayload('searching', 'working'), makeConfig());
    expect(getPendingTier(player)).toBe('working');

    player.play(makePayload('thinking', 'thinking'), makeConfig());

    expect(getPendingTier(player)).toBe('working');
  });
});
