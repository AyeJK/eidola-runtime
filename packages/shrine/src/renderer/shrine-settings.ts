import { pickFolderWithBrowser } from './browser-pick-folder.js';
import { mountEngramCardPreviews } from './engram-card-preview.js';
import { renderKrakenCamUrl } from './kraken-setup.js';
import {
  getShrineHudSettings,
  setShrineHudSettings,
  applyShrineHudSettings,
  type ShrineHudTheme,
} from './shrine-hud-settings.js';

export interface ShrineEngramEntry {
  id: string;
  name: string;
  description?: string;
  author?: string;
  previewUrl?: string;
  vesselType?: string;
  active?: boolean;
}

export interface ShrineAwakenRequest {
  engramId: string;
}

export interface ShrineSleepRequest {
  engramId: string;
}

export interface ShrineSetupController {
  show(): void;
  hide(): void;
  notifyAwakened(): void;
  showSetupMessage(message: string | null): void;
  showEscapeOverlay(): void;
  hideEscapeOverlay(): void;
  isEscapeOverlayVisible(): boolean;
  setActiveEngramId(engramId: string | null): void;
}

export interface ShrineViewRequest {
  engramId: string;
}

export interface ShrineSetupOptions {
  onAwaken: (request: ShrineAwakenRequest) => void | Promise<void>;
  onSleep: (request: ShrineSleepRequest) => void | Promise<void>;
  onView: (request: ShrineViewRequest) => void | Promise<void>;
  browseUrl?: string;
}

const DEFAULT_BROWSE_URL = 'https://eidola.app/browse';

export function applyKrakenPresentation(surface: { width: number; height: number }): void {
  document.documentElement.dataset.shrineSurface = 'kraken-elite-v2';
  document.documentElement.dataset.shrineWidth = String(surface.width);
  document.documentElement.dataset.shrineHeight = String(surface.height);
  document.documentElement.classList.add('shrine-kraken');
  document.documentElement.dataset.shrineMask = 'circle';
  document.documentElement.style.setProperty('--shrine-bg', '#000000');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function engramSigil(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'E';
}

export function mountShrineSetupPage(options: ShrineSetupOptions): ShrineSetupController {
  const host = document.querySelector<HTMLElement>('[data-shrine-setup]');
  if (!host) {
    throw new Error('Missing shrine setup host');
  }

  const browseUrl = options.browseUrl ?? DEFAULT_BROWSE_URL;
  let engrams: ShrineEngramEntry[] = [];
  let loadingEngrams = false;
  let loadError: string | null = null;
  let awakeningEngramId: string | null = null;
  let sleepingEngramId: string | null = null;
  let activeEngramId: string | null = null;
  let folderConfigured = false;
  let folderPath = '';
  let settingFolder = false;
  let pickingFolder = false;
  let escapeOverlayVisible = false;

  host.innerHTML = `
    <div class="shrine-setup-shell">
      <header class="shrine-setup-hero">
        <h1 class="shrine-setup-brand">
          <span class="text-gold-gradient">Eidola</span>
          <span class="text-shrine-gradient">Shrine</span>
          <span class="shrine-dev-badge hidden" data-dev-badge>DEV</span>
        </h1>
      </header>

      <div class="shrine-update-banner hidden" data-update-banner>
        <span data-update-banner-text></span>
        <code class="shrine-update-banner-cmd">npm install -g "@eidola/cli"</code>
      </div>

      <div class="shrine-browse-page">
        <header class="shrine-browse-header">
          <div class="shrine-browse-heading">
            <h1 class="type-title">Installed Engrams</h1>
          </div>
          <div class="shrine-folder-control">
            <button type="button" class="btn-ignite btn-nav shrine-folder-choose !normal-case" data-pick-folder>
              Choose folder
            </button>
          </div>
        </header>

        <p class="shrine-folder-error hidden" data-folder-error></p>
        <div class="shrine-engram-list-host" data-engram-list></div>

        <section class="shrine-advanced-section">
          <details class="shrine-advanced-details">
            <summary class="shrine-advanced-summary type-overline">Advanced</summary>
            <div class="shrine-advanced-panel" data-kraken-url></div>
          </details>
        </section>
      </div>
    </div>
  `;

  const folderErrorEl = host.querySelector<HTMLElement>('[data-folder-error]');
  const pickFolderBtn = host.querySelector<HTMLButtonElement>('[data-pick-folder]');
  const engramListNode = host.querySelector<HTMLElement>('[data-engram-list]');
  const krakenUrlNode = host.querySelector<HTMLElement>('[data-kraken-url]');

  if (!folderErrorEl || !pickFolderBtn || !engramListNode || !krakenUrlNode) {
    throw new Error('Shrine setup markup incomplete');
  }

  const ui = {
    folderErrorEl,
    pickFolderBtn,
    engramList: engramListNode,
    krakenUrl: krakenUrlNode,
  };

  renderKrakenCamUrl(ui.krakenUrl);

  const escapeOverlay = document.createElement('div');
  escapeOverlay.className = 'shrine-escape-overlay hidden';
  escapeOverlay.dataset.shrineEscapeOverlay = '';
  escapeOverlay.innerHTML = `
    <div class="shrine-escape-panel ui-panel-strong" role="dialog" aria-modal="true" aria-labelledby="shrine-escape-title">
      <div class="shrine-escape-header">
        <button type="button" class="shrine-escape-back" data-escape-resume aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h2 id="shrine-escape-title" class="shrine-escape-title">Shrine Options</h2>
      </div>
      <div class="shrine-hud-settings">
        <label class="shrine-hud-setting-row" for="shrine-hud-enabled-toggle">
          <span class="shrine-hud-setting-label">Enable overlay</span>
          <input type="checkbox" id="shrine-hud-enabled-toggle" class="shrine-hud-checkbox" data-hud-enabled-toggle />
        </label>
        <label class="shrine-hud-setting-row" for="shrine-hud-theme-select">
          <span class="shrine-hud-setting-label">Text theme</span>
          <select id="shrine-hud-theme-select" class="shrine-hud-select" data-hud-theme-select>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </div>
      <div class="shrine-escape-actions">
        <button type="button" class="btn-divine btn-nav !normal-case" data-escape-sleep>Sleep</button>
      </div>
    </div>
  `;
  document.body.appendChild(escapeOverlay);

  const escapeResumeBtn = escapeOverlay.querySelector<HTMLButtonElement>('[data-escape-resume]');
  const escapeSleepBtn = escapeOverlay.querySelector<HTMLButtonElement>('[data-escape-sleep]');
  const hudEnabledToggle = escapeOverlay.querySelector<HTMLInputElement>('[data-hud-enabled-toggle]');
  const hudThemeSelect = escapeOverlay.querySelector<HTMLSelectElement>('[data-hud-theme-select]');

  if (!escapeResumeBtn || !escapeSleepBtn || !hudEnabledToggle || !hudThemeSelect) {
    throw new Error('Shrine escape overlay incomplete');
  }

  const hudEnabledToggleEl = hudEnabledToggle;
  const hudThemeSelectEl = hudThemeSelect;

  function refreshHudSettingsControls(): void {
    const settings = getShrineHudSettings();
    hudEnabledToggleEl.checked = settings.enabled;
    hudThemeSelectEl.value = settings.theme;
  }

  refreshHudSettingsControls();

  hudEnabledToggleEl.addEventListener('change', () => {
    const settings = getShrineHudSettings();
    const next = { ...settings, enabled: hudEnabledToggleEl.checked };
    setShrineHudSettings(next);
    applyShrineHudSettings(next);
  });

  hudThemeSelectEl.addEventListener('change', () => {
    const settings = getShrineHudSettings();
    const theme = (hudThemeSelectEl.value === 'light' ? 'light' : 'dark') as ShrineHudTheme;
    const next = { ...settings, theme };
    setShrineHudSettings(next);
    applyShrineHudSettings(next);
  });

  function updateFolderError(message: string | null): void {
    ui.folderErrorEl.textContent = message ?? '';
    ui.folderErrorEl.classList.toggle('hidden', !message);
  }

  function renderEngrams(): void {
    if (!folderConfigured) {
      ui.engramList.innerHTML = `
        <p class="shrine-engram-status">Choose a folder to load your Engrams.</p>
      `;
      return;
    }

    if (loadingEngrams) {
      ui.engramList.innerHTML = '<p class="shrine-engram-status">Loading Engrams…</p>';
      return;
    }

    if (loadError) {
      ui.engramList.innerHTML = `<p class="shrine-engram-status shrine-engram-status--error">${escapeHtml(loadError)}</p>`;
      return;
    }

    if (engrams.length === 0) {
      ui.engramList.innerHTML = `
        <div class="shrine-engram-empty">
          <p class="shrine-engram-empty-text">No Engrams in this folder yet.</p>
          <a class="shrine-engram-browse btn-ignite btn-nav !normal-case" href="${escapeHtml(browseUrl)}">
            Browse Engrams →
          </a>
        </div>
      `;
      return;
    }

    ui.engramList.innerHTML = `
      <div class="shrine-engram-grid">
        ${engrams
          .map((entry) => {
            const description = entry.description?.trim();
            const author = entry.author?.trim();
            const displayName = entry.name.trim() || entry.id;
            const isActive = entry.active === true || activeEngramId === entry.id;
            const awakening = awakeningEngramId === entry.id;
            const sleeping = sleepingEngramId === entry.id;
            const previewUrl = entry.previewUrl?.trim();
            const vesselType = entry.vesselType?.trim() ?? 'lottie';
            const previewMarkup = previewUrl
              ? `<div class="listing-card-preview-media" data-preview-url="${escapeHtml(previewUrl)}" data-vessel-type="${escapeHtml(vesselType)}"></div>`
              : `<span class="sigil sigil-lg">${escapeHtml(engramSigil(displayName))}</span>`;
            const activeBadge = isActive
              ? '<span class="listing-card-active-badge" data-active-badge>Active</span>'
              : '';

            const actionButton = isActive
              ? `<div class="listing-card-action-group">
                   <button
                     type="button"
                     class="btn-ignite btn-nav listing-card-sleep !normal-case"
                     data-sleep-engram="${escapeHtml(entry.id)}"
                     ${sleeping ? 'disabled' : ''}
                   >
                     ${sleeping ? 'Sleeping…' : 'Sleep'}
                   </button>
                   <button
                     type="button"
                     class="btn-divine btn-nav listing-card-view !normal-case"
                     data-view-engram="${escapeHtml(entry.id)}"
                   >
                     View
                   </button>
                 </div>`
              : `<button
                   type="button"
                   class="btn-divine btn-nav listing-card-awaken !normal-case"
                   data-awaken-engram="${escapeHtml(entry.id)}"
                   ${awakening ? 'disabled' : ''}
                 >
                   ${awakening ? 'Awakening…' : 'Awaken'}
                 </button>`;

            return `
              <article class="listing-card group${isActive ? ' listing-card--active' : ''}">
                <div class="listing-card-preview" aria-hidden="true">
                  ${previewMarkup}
                  ${activeBadge}
                </div>
                <div class="listing-card-body">
                  <div class="listing-card-title-row">
                    <h3 class="listing-card-name">${escapeHtml(displayName)}</h3>
                    ${author ? `<p class="listing-card-author">${escapeHtml(author)}</p>` : ''}
                  </div>
                  ${description ? `<p class="listing-card-description">${escapeHtml(description)}</p>` : ''}
                  <div class="listing-card-footer">
                    ${actionButton}
                  </div>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;

    mountEngramCardPreviews(ui.engramList);
  }

  function updatePickFolderButton(): void {
    ui.pickFolderBtn.disabled = pickingFolder || settingFolder;
    ui.pickFolderBtn.textContent = pickingFolder ? 'Opening…' : 'Choose folder';
  }

  async function loadFolder(): Promise<void> {
    try {
      const response = await fetch('/shrine/api/folder');
      if (!response.ok) {
        throw new Error('Could not load folder settings.');
      }

      const payload = (await response.json()) as {
        path?: string;
        configured?: boolean;
      };

      folderPath = payload.path?.trim() ?? '';
      folderConfigured = Boolean(payload.configured && folderPath);
    } catch {
      folderConfigured = false;
    }

    if (folderConfigured) {
      await loadEngrams();
    } else {
      renderEngrams();
    }
  }

  async function pickFolder(): Promise<void> {
    pickingFolder = true;
    updateFolderError(null);
    updatePickFolderButton();

    try {
      const picked = await pickFolderWithBrowser();
      if (!picked.ok) {
        if ('cancelled' in picked && picked.cancelled) {
          return;
        }
        throw new Error('error' in picked ? picked.error : 'Could not open folder picker.');
      }

      const response = await fetch('/shrine/api/folder/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderName: picked.folderName,
          engramIds: picked.engramIds,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        path?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok || !payload.path?.trim()) {
        throw new Error(payload?.error ?? 'Could not resolve the selected folder.');
      }

      folderPath = payload.path.trim();
      await setFolder();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open folder picker.';
      updateFolderError(message);
    } finally {
      pickingFolder = false;
      updatePickFolderButton();
    }
  }

  async function setFolder(): Promise<boolean> {
    if (!folderPath.trim()) {
      updateFolderError('Choose a folder first.');
      return false;
    }

    settingFolder = true;
    updateFolderError(null);
    updatePickFolderButton();

    try {
      const response = await fetch('/shrine/api/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        path?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? 'Could not set folder.');
      }

      folderPath = payload.path?.trim() ?? folderPath;
      folderConfigured = true;
      await loadEngrams();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not set folder.';
      updateFolderError(message);
      folderConfigured = false;
      return false;
    } finally {
      settingFolder = false;
      updatePickFolderButton();
    }
  }

  async function loadEngrams(): Promise<void> {
    loadingEngrams = true;
    loadError = null;
    renderEngrams();

    try {
      const response = await fetch('/shrine/api/engrams');
      if (!response.ok) {
        throw new Error('Could not load Engrams.');
      }

      const payload = (await response.json()) as {
        ok?: boolean;
        engrams?: ShrineEngramEntry[];
        folder_required?: boolean;
      };

      if (payload.folder_required) {
        folderConfigured = false;
        engrams = [];
        return;
      }

      engrams = Array.isArray(payload.engrams) ? payload.engrams : [];
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Could not load Engrams.';
      engrams = [];
    } finally {
      loadingEngrams = false;
      renderEngrams();
    }
  }

  async function awakenEngram(engramId: string): Promise<void> {
    if (awakeningEngramId) {
      return;
    }

    if (!folderConfigured) {
      updateFolderError('Choose a folder first.');
      return;
    }

    awakeningEngramId = engramId;
    renderEngrams();

    try {
      await options.onAwaken({ engramId });
    } finally {
      awakeningEngramId = null;
      renderEngrams();
    }
  }

  async function sleepEngram(engramId: string): Promise<void> {
    if (sleepingEngramId) {
      return;
    }

    sleepingEngramId = engramId;
    renderEngrams();

    try {
      await options.onSleep({ engramId });
    } finally {
      sleepingEngramId = null;
      renderEngrams();
    }
  }

  function viewEngram(engramId: string): void {
    void options.onView({ engramId });
  }

  function setActiveEngramId(engramId: string | null): void {
    activeEngramId = engramId;
    renderEngrams();
  }

  function showEscapeOverlay(): void {
    escapeOverlayVisible = true;
    refreshHudSettingsControls();
    escapeOverlay.classList.remove('hidden');
  }

  function hideEscapeOverlay(): void {
    escapeOverlayVisible = false;
    escapeOverlay.classList.add('hidden');
  }

  const setupHost = host;

  function show(): void {
    setupHost.hidden = false;
    setupHost.classList.remove('hidden');
    document.documentElement.classList.remove('shrine-awakened');
    hideEscapeOverlay();
  }

  function hide(): void {
    setupHost.hidden = true;
    setupHost.classList.add('hidden');
  }

  function notifyAwakened(): void {
    // setup hidden while awakened
  }

  function showSetupMessage(message: string | null): void {
    updateFolderError(message);
  }

  void loadFolder();

  const updateBanner = host.querySelector<HTMLElement>('[data-update-banner]');
  const updateBannerText = host.querySelector<HTMLElement>('[data-update-banner-text]');

  if (updateBanner && updateBannerText) {
    fetch('/shrine/api/version-check')
      .then((r) => r.json())
      .then((data: { currentVersion: string; latestVersion: string; updateAvailable: boolean }) => {
        if (data.updateAvailable) {
          updateBannerText.textContent = `Update available: v${data.currentVersion} → v${data.latestVersion} — run `;
          updateBanner.classList.remove('hidden');
        }
      })
      .catch(() => { /* offline or unavailable — stay hidden */ });
  }

  const devBadge = host.querySelector<HTMLElement>('[data-dev-badge]');
  if (devBadge) {
    fetch('/health')
      .then((r) => r.json())
      .then((data: { dev?: boolean }) => {
        if (data.dev) {
          devBadge.classList.remove('hidden');
          document.title = 'Eidola Shrine — DEV';
        }
      })
      .catch(() => { /* offline or unavailable — stay hidden */ });
  }

  ui.pickFolderBtn.addEventListener('click', () => {
    void pickFolder();
  });

  ui.engramList.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const sleepBtn = target.closest<HTMLButtonElement>('[data-sleep-engram]');
    if (sleepBtn?.dataset.sleepEngram) {
      void sleepEngram(sleepBtn.dataset.sleepEngram);
      return;
    }

    const viewBtn = target.closest<HTMLButtonElement>('[data-view-engram]');
    if (viewBtn?.dataset.viewEngram) {
      viewEngram(viewBtn.dataset.viewEngram);
      return;
    }

    const awakenBtn = target.closest<HTMLButtonElement>('[data-awaken-engram]');
    if (!awakenBtn?.dataset.awakenEngram) {
      return;
    }

    void awakenEngram(awakenBtn.dataset.awakenEngram);
  });

  escapeResumeBtn.addEventListener('click', () => {
    hideEscapeOverlay();
  });

  escapeSleepBtn.addEventListener('click', () => {
    hideEscapeOverlay();
    if (activeEngramId) {
      void sleepEngram(activeEngramId);
    } else {
      window.dispatchEvent(new Event('shrine-request-return'));
    }
  });

  escapeOverlay.addEventListener('click', (event) => {
    if (event.target === escapeOverlay) {
      hideEscapeOverlay();
    }
  });

  show();

  return {
    show,
    hide,
    notifyAwakened,
    showSetupMessage,
    showEscapeOverlay,
    hideEscapeOverlay,
    isEscapeOverlayVisible: () => escapeOverlayVisible,
    setActiveEngramId,
  };
}
