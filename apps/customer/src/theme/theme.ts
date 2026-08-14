export type Theme = 'light' | 'dark';

export const DEFAULT_THEME: Theme = 'light';
export const SUPPORTED_THEMES: readonly Theme[] = ['light', 'dark'];

export const THEME_STORAGE_KEY = 'vaylet_guest_theme';
export const THEME_CHANGE_EVENT = 'vaylet_theme_change';

export const THEME_COLORS: Readonly<Record<Theme, string>> = {
  light: '#FAFAF8',
  dark: '#07111F',
};

export function isSupportedTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (SUPPORTED_THEMES as readonly string[]).includes(value);
}

export function getPersistedTheme(): Theme {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME;
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isSupportedTheme(stored)) {
      return stored;
    }
  } catch {
    // Storage access may fail in restricted/private contexts
  }

  return DEFAULT_THEME;
}

export function setPersistedTheme(theme: Theme): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (isSupportedTheme(theme)) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Storage access may fail in restricted/private contexts
  }
}

export function commitThemeChange(newTheme: Theme): void {
  setPersistedTheme(newTheme);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Synchronize browser/PWA chrome theme-color meta tag if present
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', THEME_COLORS[newTheme]);
    }
  }
}
