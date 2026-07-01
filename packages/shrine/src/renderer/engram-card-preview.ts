import lottie from 'lottie-web';
import type { AnimationItem } from 'lottie-web';

/** Center band of the viewport that counts as "focused" — roughly the middle third. Matches the browse page. */
const FOCUS_ROOT_MARGIN = '-35% 0px -35% 0px';
const FOCUS_EXIT_DELAY_MS = 150;

function isVideoType(vesselType: string): boolean {
  return vesselType === 'webm' || vesselType === 'mp4';
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface CardPreviewState {
  host: HTMLElement;
  url: string;
  vesselType: string;
  inView: boolean;
  inFocus: boolean;
  focusExitTimer: ReturnType<typeof setTimeout> | null;
  lottieAnim: AnimationItem | null;
  video: HTMLVideoElement | null;
  gifImage: HTMLImageElement | null;
  gifCanvas: HTMLCanvasElement | null;
}

function shouldAnimate(state: CardPreviewState): boolean {
  return state.inView && state.inFocus && !prefersReducedMotion();
}

function clearHost(state: CardPreviewState): void {
  state.lottieAnim?.destroy();
  state.lottieAnim = null;
  state.video = null;
  state.gifImage = null;
  state.gifCanvas = null;
  state.host.replaceChildren();
}

function syncVideo(state: CardPreviewState, playing: boolean): void {
  const video = state.video;
  if (!video) {
    return;
  }

  if (!playing) {
    video.pause();
    return;
  }

  const playWhenReady = () => {
    void video.play().catch(() => {
      /* autoplay may block without gesture */
    });
  };

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    playWhenReady();
    return;
  }

  video.addEventListener('canplay', playWhenReady, { once: true });
}

function syncLottie(state: CardPreviewState, playing: boolean): void {
  if (!state.lottieAnim) {
    return;
  }
  if (playing) {
    state.lottieAnim.play();
  } else {
    state.lottieAnim.pause();
  }
}

function mountGifFrame(state: CardPreviewState): void {
  if (state.gifCanvas && !state.gifImage) {
    return;
  }

  state.gifImage = null;
  const canvas = document.createElement('canvas');
  canvas.className = 'listing-card-media';
  canvas.setAttribute('aria-hidden', 'true');
  state.host.replaceChildren(canvas);
  state.gifCanvas = canvas;

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const image = new Image();
  image.onload = () => {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    context.drawImage(image, 0, 0);
  };
  image.src = state.url;
}

function mountGifAnimated(state: CardPreviewState): void {
  if (state.gifImage) {
    return;
  }

  state.gifCanvas = null;
  const image = document.createElement('img');
  image.src = state.url;
  image.alt = '';
  image.className = 'listing-card-media';
  state.host.replaceChildren(image);
  state.gifImage = image;
  state.gifCanvas = null;
}

function mountVideoPreview(state: CardPreviewState): void {
  if (state.video) {
    return;
  }

  const video = document.createElement('video');
  video.src = state.url;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.className = 'listing-card-media';
  state.host.replaceChildren(video);
  state.video = video;
  video.load();
}

async function mountLottiePreview(state: CardPreviewState): Promise<void> {
  if (state.lottieAnim) {
    return;
  }

  const response = await fetch(state.url);
  if (!response.ok) {
    throw new Error(`Could not load preview (${response.status}).`);
  }

  const animationData = (await response.json()) as object;
  state.host.replaceChildren();
  state.lottieAnim = lottie.loadAnimation({
    container: state.host,
    renderer: 'canvas',
    loop: true,
    autoplay: false,
    animationData,
    rendererSettings: {
      clearCanvas: true,
      progressiveLoad: false,
    },
  });
}

async function ensureMounted(state: CardPreviewState): Promise<void> {
  if (!state.inView) {
    clearHost(state);
    return;
  }

  const { vesselType } = state;
  const reduced = prefersReducedMotion();

  try {
    if (isVideoType(vesselType)) {
      mountVideoPreview(state);
      return;
    }

    if (vesselType === 'gif') {
      if (shouldAnimate(state)) {
        mountGifAnimated(state);
      } else {
        mountGifFrame(state);
      }
      return;
    }

    await mountLottiePreview(state);
    if (reduced) {
      syncLottie(state, false);
    }
  } catch {
    clearHost(state);
  }
}

async function syncPreview(state: CardPreviewState): Promise<void> {
  if (!state.inView) {
    clearHost(state);
    return;
  }

  await ensureMounted(state);

  const playing = shouldAnimate(state);

  if (isVideoType(state.vesselType)) {
    syncVideo(state, playing);
    return;
  }

  if (state.vesselType === 'gif') {
    if (playing) {
      mountGifAnimated(state);
    } else {
      mountGifFrame(state);
    }
    return;
  }

  syncLottie(state, playing);
}

function bindInView(state: CardPreviewState): void {
  const observer = new IntersectionObserver(
    ([entry]) => {
      state.inView = entry.isIntersecting;
      void syncPreview(state);
    },
    { rootMargin: '200px 0px' },
  );

  observer.observe(state.host);
}

function bindInFocus(state: CardPreviewState): void {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        if (state.focusExitTimer !== null) {
          clearTimeout(state.focusExitTimer);
          state.focusExitTimer = null;
        }
        state.inFocus = true;
        void syncPreview(state);
        return;
      }

      state.focusExitTimer = setTimeout(() => {
        state.focusExitTimer = null;
        state.inFocus = false;
        void syncPreview(state);
      }, FOCUS_EXIT_DELAY_MS);
    },
    { rootMargin: FOCUS_ROOT_MARGIN },
  );

  observer.observe(state.host);
}

export function mountEngramCardPreviews(root: HTMLElement): void {
  const cards = root.querySelectorAll<HTMLElement>('.listing-card');

  for (const card of cards) {
    const host = card.querySelector<HTMLElement>('[data-preview-url]');
    const url = host?.dataset.previewUrl?.trim();
    if (!host || !url) {
      continue;
    }

    const state: CardPreviewState = {
      host,
      url,
      vesselType: host.dataset.vesselType?.trim() ?? 'lottie',
      inView: false,
      inFocus: false,
      focusExitTimer: null,
      lottieAnim: null,
      video: null,
      gifImage: null,
      gifCanvas: null,
    };

    bindInView(state);
    bindInFocus(state);
  }
}
