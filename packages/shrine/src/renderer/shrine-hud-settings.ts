export type ShrineHudTheme = 'dark' | 'light';

export interface ShrineHudSettings {
  enabled: boolean;
  theme: ShrineHudTheme;
}

const STORAGE_KEY = 'eidola-shrine-hud-settings';

const DEFAULT_SETTINGS: ShrineHudSettings = {
  enabled: true,
  theme: 'dark',
};

function isValidTheme(value: unknown): value is ShrineHudTheme {
  return value === 'dark' || value === 'light';
}

/** Read persisted HUD settings synchronously. Safe to call before first paint. */
export function getShrineHudSettings(): ShrineHudSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw) as Partial<ShrineHudSettings>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
      theme: isValidTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setShrineHudSettings(settings: ShrineHudSettings): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore persistence failures (private mode, quota, etc.)
  }
}

/** Apply settings to the document so CSS can react immediately (call before first paint). */
export function applyShrineHudSettings(settings: ShrineHudSettings): void {
  const root = document.documentElement;
  root.dataset.shrineHudTheme = settings.theme;
  root.dataset.shrineHudEnabled = String(settings.enabled);
}
