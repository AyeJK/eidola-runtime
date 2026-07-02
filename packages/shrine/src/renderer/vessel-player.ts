import lottie, { type AnimationItem } from 'lottie-web';
import { TOOL_AWARE_STATES } from '@eidola/tool-state';
import '../shared/shrine-api.js';
import type { ShrineStatePayload, ShrineVesselConfig } from '../shared/types.js';

interface PlayOptions {
  loop: boolean;
  crossfadeMs: number;
  returnToIdle: boolean;
  onComplete?: () => void;
}

export class VesselPlayer {
  private readonly stage: HTMLElement;
  private readonly layerA: HTMLElement;
  private readonly layerB: HTMLElement;
  private readonly halo: HTMLElement;
  private active: 'a' | 'b' = 'a';
  private animation: AnimationItem | null = null;
  private activeVideo: HTMLVideoElement | null = null;
  private mediaType: 'lottie' | 'webm' | 'gif' = 'lottie';
  private crossfadeMs = 300;
  private minHoldMs = 1000;
  private workingExitHoldMs = 4000;
  private idlePayload: ShrineStatePayload | null = null;
  private autoIdleHandler: (() => void | Promise<void>) | null = null;
  private currentClipUrl = '';
  private currentVisualTier = '';
  private currentStateStartedAt = 0;

  private isPlaying = false;
  private pendingPlay: { payload: ShrineStatePayload; config: ShrineVesselConfig } | null = null;
  private holdTimer: number | null = null;
  private currentPlay: Promise<void> = Promise.resolve();
  private onVisualTierChange: ((payload: ShrineStatePayload) => void) | null = null;

  constructor(root: HTMLElement) {
    this.stage = root;
    this.halo = root.querySelector<HTMLElement>('.vessel-halo')!;
    this.layerA = root.querySelector<HTMLElement>('.vessel-layer-a')!;
    this.layerB = root.querySelector<HTMLElement>('.vessel-layer-b')!;
    this.layerA.style.opacity = '1';
    this.layerB.style.opacity = '0';
  }

  setConfig(config: ShrineVesselConfig): void {
    this.crossfadeMs = config.crossfadeMs;
    this.minHoldMs = config.minHoldMs;
    this.workingExitHoldMs = config.workingExitHoldMs;
    this.mediaType =
      config.rendererType === 'webm'
        ? 'webm'
        : config.rendererType === 'gif'
          ? 'gif'
          : 'lottie';
    this.stage.style.setProperty('--crossfade-ms', `${config.crossfadeMs}ms`);
  }

  setIdlePayload(payload: ShrineStatePayload): void {
    this.idlePayload = payload;
  }

  setAutoIdleHandler(handler: (() => void | Promise<void>) | null): void {
    this.autoIdleHandler = handler;
  }

  /**
   * Fired exactly when a clip transition actually commits — i.e. after the
   * minHoldMs/pendingPlay gating in `play()` has resolved, not when a state
   * payload first arrives. Callers should drive HUD text off this instead of
   * the incoming payload, otherwise the label can flip to a new state while
   * the vessel is still holding/queued on the old clip.
   */
  setVisualTierChangeHandler(handler: ((payload: ShrineStatePayload) => void) | null): void {
    this.onVisualTierChange = handler;
  }

  play(payload: ShrineStatePayload, config: ShrineVesselConfig): Promise<void> {
    const visualTier = payload.broadcast.visual_state ?? payload.broadcast.state;
    if (
      !this.isPlaying &&
      this.holdTimer === null &&
      visualTier === this.currentVisualTier &&
      payload.clipUrl === this.currentClipUrl
    ) {
      return this.currentPlay;
    }

    if (this.isPlaying) {
      this.setPendingPlay(payload, config);
      return this.currentPlay;
    }

    const elapsed = performance.now() - this.currentStateStartedAt;
    const holdMs = this.resolveHoldMs(this.currentVisualTier, visualTier);
    if (elapsed < holdMs) {
      this.setPendingPlay(payload, config);
      if (this.holdTimer === null) {
        this.holdTimer = window.setTimeout(() => {
          this.holdTimer = null;
          const next = this.pendingPlay;
          this.pendingPlay = null;
          if (next) {
            void this.play(next.payload, next.config);
          }
        }, holdMs - elapsed);
      }
      return this.currentPlay;
    }

    this.isPlaying = true;
    this.currentPlay = this.playInternal(payload, config).finally(() => {
      this.isPlaying = false;
      if (this.pendingPlay) {
        const next = this.pendingPlay;
        this.pendingPlay = null;
        void this.play(next.payload, next.config);
      }
    });
    return this.currentPlay;
  }

  /**
   * `working` gets a longer floor than the generic `minHoldMs` before it's
   * allowed to yield to `thinking`/`waiting` — those two are the tool-adjacent
   * "what's next" tiers the broadcaster falls back to between fast tool calls
   * (see `DEFAULT_THINKING_GRACE_MS`), and without this, every brief gap
   * between tools flickers `working` → `thinking`/`waiting` → `working`. Every
   * other transition (into `working` itself, or into `error`/`success`/
   * `attention`/`idle`/`responding`) keeps reacting at the normal `minHoldMs`.
   */
  private resolveHoldMs(fromTier: string, toTier: string): number {
    if (fromTier === 'working' && (toTier === 'thinking' || toTier === 'waiting')) {
      return this.workingExitHoldMs;
    }
    return this.minHoldMs;
  }

  /**
   * Stash an incoming payload as the next thing to play once the current
   * clip/hold finishes. A pending tool-aware state (`searching`/`writing`/
   * `working`) is never silently clobbered by an incoming `'thinking'` —
   * `PostToolUse`/`postToolUse` maps to `'thinking'` and fires almost
   * immediately after a fast tool's `searching`/`working` state, so without
   * this guard the tool-aware frame would be queued then overwritten before
   * it ever renders. Every other case (including a newer tool-aware state
   * replacing an older one, or a terminal/attention state replacing a
   * pending `'thinking'`) keeps last-write-wins.
   */
  private setPendingPlay(payload: ShrineStatePayload, config: ShrineVesselConfig): void {
    const incomingTier = payload.broadcast.visual_state ?? payload.broadcast.state;
    const pendingTier = this.pendingPlay
      ? this.pendingPlay.payload.broadcast.visual_state ?? this.pendingPlay.payload.broadcast.state
      : null;

    if (
      pendingTier !== null &&
      (TOOL_AWARE_STATES as readonly string[]).includes(pendingTier) &&
      incomingTier === 'thinking'
    ) {
      return;
    }

    this.pendingPlay = { payload, config };
  }

  private async playInternal(
    payload: ShrineStatePayload,
    config: ShrineVesselConfig,
  ): Promise<void> {
    const visualTier = payload.broadcast.visual_state ?? payload.broadcast.state;
    if (visualTier === this.currentVisualTier && payload.clipUrl === this.currentClipUrl) {
      return;
    }

    this.currentVisualTier = visualTier;
    this.crossfadeMs = config.crossfadeMs;
    this.onVisualTierChange?.(payload);
    await this.playClip(payload.clipUrl, {
      loop: payload.loop,
      crossfadeMs: config.crossfadeMs,
      returnToIdle: payload.returnToIdle,
      onComplete: payload.returnToIdle ? () => this.handleAutoIdle() : undefined,
    });
    this.currentStateStartedAt = performance.now();
    this.pulseHalo();
  }

  private async handleAutoIdle(): Promise<void> {
    if (this.autoIdleHandler) {
      await this.autoIdleHandler();
      return;
    }

    await this.playIdleFallback();
  }

  private async playIdleFallback(): Promise<void> {
    if (!this.idlePayload) {
      return;
    }

    // Called outside playInternal's dedupe guard (auto-idle handoff and the
    // load-failure catch blocks below both call this directly), so it has to
    // resync currentVisualTier itself — otherwise it's left pointing at
    // whatever state we were trying to show, while currentClipUrl ends up on
    // the idle clip we actually rendered. The next broadcast of that stale
    // state then mismatches on clipUrl and re-triggers a clip we're already
    // playing.
    this.currentVisualTier = 'idle';
    this.onVisualTierChange?.(this.idlePayload);
    await this.playClip(this.idlePayload.clipUrl, {
      loop: this.idlePayload.loop,
      crossfadeMs: this.crossfadeMs,
      returnToIdle: false,
    });
  }

  private async playClip(url: string, options: PlayOptions, attempt = 0): Promise<void> {
    if (this.mediaType === 'webm') {
      return this.playWebMClip(url, options, attempt);
    }
    if (this.mediaType === 'gif') {
      return this.playGifClip(url, options, attempt);
    }
    return this.playLottieClip(url, options, attempt);
  }

  private async playLottieClip(url: string, options: PlayOptions, attempt = 0): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`clip fetch failed: ${response.status}`);
      }

      const animationData = await response.json();
      const incoming = this.active === 'a' ? this.layerB : this.layerA;
      const outgoing = this.active === 'a' ? this.layerA : this.layerB;

      incoming.replaceChildren();

      const anim = lottie.loadAnimation({
        container: incoming,
        renderer: 'canvas',
        loop: options.loop,
        autoplay: true,
        animationData,
        rendererSettings: {
          clearCanvas: true,
          progressiveLoad: false,
        },
      });

      await this.waitForLottieReady(anim, url);
      this.fitLottieCover(incoming, animationData);

      if (options.onComplete && !options.loop) {
        this.scheduleOneShotComplete(anim, animationData, options.onComplete);
      }

      await this.crossfade(outgoing, incoming, options.crossfadeMs);

      this.animation?.destroy();
      outgoing.replaceChildren();
      this.animation = anim;
      this.active = this.active === 'a' ? 'b' : 'a';
      this.currentClipUrl = url;

      await this.ensureLottiePainted(anim, options.loop);
      this.fitLottieCover(incoming, animationData);
    } catch (error) {
      window.eidolaShrine.log(String(error));
      if (attempt < 1) {
        await this.playLottieClip(url, options, attempt + 1);
        return;
      }
      if (this.idlePayload && url !== this.idlePayload.clipUrl) {
        await this.playIdleFallback();
      }
    }
  }

  private async playWebMClip(url: string, options: PlayOptions, attempt = 0): Promise<void> {
    try {
      const incoming = this.active === 'a' ? this.layerB : this.layerA;
      const outgoing = this.active === 'a' ? this.layerA : this.layerB;

      incoming.replaceChildren();

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.loop = options.loop;
      video.preload = 'auto';
      video.className = 'vessel-media';
      incoming.appendChild(video);

      await this.waitForWebMReady(video, url);
      await video.play();

      if (options.onComplete && !options.loop) {
        video.addEventListener(
          'ended',
          () => {
            void options.onComplete?.();
          },
          { once: true },
        );
      }

      await this.crossfade(outgoing, incoming, options.crossfadeMs);

      this.animation?.destroy();
      this.animation = null;
      this.activeVideo?.pause();
      outgoing.replaceChildren();

      this.activeVideo = video;
      this.active = this.active === 'a' ? 'b' : 'a';
      this.currentClipUrl = url;
    } catch (error) {
      window.eidolaShrine.log(String(error));
      if (attempt < 1) {
        await this.playWebMClip(url, options, attempt + 1);
        return;
      }
      if (this.idlePayload && url !== this.idlePayload.clipUrl) {
        await this.playIdleFallback();
      }
    }
  }

  private async playGifClip(url: string, options: PlayOptions, attempt = 0): Promise<void> {
    try {
      const incoming = this.active === 'a' ? this.layerB : this.layerA;
      const outgoing = this.active === 'a' ? this.layerA : this.layerB;

      incoming.replaceChildren();

      const image = document.createElement('img');
      image.alt = '';
      image.className = 'vessel-media';
      incoming.appendChild(image);

      await this.waitForImageReady(image, url);

      if (options.onComplete && !options.loop) {
        window.setTimeout(() => {
          void options.onComplete?.();
        }, 3000);
      }

      await this.crossfade(outgoing, incoming, options.crossfadeMs);

      this.animation?.destroy();
      this.animation = null;
      this.activeVideo?.pause();
      this.activeVideo = null;
      outgoing.replaceChildren();

      this.active = this.active === 'a' ? 'b' : 'a';
      this.currentClipUrl = url;
    } catch (error) {
      window.eidolaShrine.log(String(error));
      if (attempt < 1) {
        await this.playGifClip(url, options, attempt + 1);
        return;
      }
      if (this.idlePayload && url !== this.idlePayload.clipUrl) {
        await this.playIdleFallback();
      }
    }
  }

  private waitForImageReady(image: HTMLImageElement, url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (ok) {
          resolve();
        } else {
          reject(new Error(`gif load failed: ${url}`));
        }
      };

      const timeout = window.setTimeout(() => finish(false), 8000);

      const onReady = () => finish(true);
      const onFail = () => finish(false);

      const cleanup = () => {
        window.clearTimeout(timeout);
        image.removeEventListener('load', onReady);
        image.removeEventListener('error', onFail);
      };

      image.addEventListener('load', onReady);
      image.addEventListener('error', onFail);
      image.src = url;
    });
  }

  private waitForWebMReady(video: HTMLVideoElement, url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (ok) {
          resolve();
        } else {
          reject(new Error(`webm load failed: ${url}`));
        }
      };

      const timeout = window.setTimeout(() => finish(false), 8000);

      const onReady = () => finish(true);
      const onFail = () => finish(false);

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onFail);
      };

      video.addEventListener('canplay', onReady);
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('error', onFail);
      video.src = url;
      video.load();
    });
  }

  private scheduleOneShotComplete(
    anim: AnimationItem,
    animationData: { op?: number; fr?: number },
    onComplete: () => void,
  ): void {
    let fired = false;
    const fire = () => {
      if (fired) {
        return;
      }
      fired = true;
      void onComplete();
    };

    anim.addEventListener('complete', fire);

    const op = animationData.op ?? 0;
    const fr = animationData.fr ?? 15;
    if (op > 0 && fr > 0) {
      window.setTimeout(fire, Math.ceil((op / fr) * 1000) + 250);
    }
  }

  private waitForLottieReady(anim: AnimationItem, url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (ok) {
          resolve();
        } else {
          reject(new Error(`lottie data_failed: ${url}`));
        }
      };

      const timeout = window.setTimeout(() => finish(false), 5000);

      const onReady = () => finish(true);
      const onFail = () => finish(false);

      const cleanup = () => {
        window.clearTimeout(timeout);
        anim.removeEventListener('DOMLoaded', onReady);
        anim.removeEventListener('config_ready', onReady);
        anim.removeEventListener('data_failed', onFail);
      };

      anim.addEventListener('DOMLoaded', onReady);
      anim.addEventListener('config_ready', onReady);
      anim.addEventListener('data_failed', onFail);
    }).then(() => {
      anim.resize();
    });
  }

  private async ensureLottiePainted(anim: AnimationItem, looping = false): Promise<void> {
    anim.goToAndPlay(0, true);
    for (let i = 0; i < 3; i += 1) {
      anim.resize();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (looping) {
      anim.play();
    }
  }

  private fitLottieCover(
    container: HTMLElement,
    animationData: { w?: number; h?: number },
  ): void {
    const canvas = container.querySelector('canvas');
    if (!canvas) {
      return;
    }

    const natW = animationData.w ?? canvas.width;
    const natH = animationData.h ?? canvas.height;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!natW || !natH || cw <= 0 || ch <= 0) {
      return;
    }

    const scale = Math.max(cw / natW, ch / natH);
    const width = natW * scale;
    const height = natH * scale;
    canvas.style.position = 'absolute';
    canvas.style.left = `${(cw - width) / 2}px`;
    canvas.style.top = `${(ch - height) / 2}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  private crossfade(
    outgoing: HTMLElement,
    incoming: HTMLElement,
    durationMs: number,
  ): Promise<void> {
    incoming.style.opacity = '0';
    outgoing.style.opacity = '1';

    return new Promise<void>((resolve) => {
      const start = performance.now();

      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs);
        incoming.style.opacity = String(progress);
        outgoing.style.opacity = String(1 - progress);

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(step);
    });
  }

  private pulseHalo(): void {
    this.halo.classList.remove('halo-pulse');
    void this.halo.offsetWidth;
    this.halo.classList.add('halo-pulse');
  }
}
