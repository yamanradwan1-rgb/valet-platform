export type Theme = 'light' | 'dark';

export const DEFAULT_THEME: Theme = 'light';
export const SUPPORTED_THEMES: readonly Theme[] = ['light', 'dark'];

export const THEME_STORAGE_KEY = 'vaylet_guest_theme';
export const THEME_CHANGE_EVENT = 'vaylet_theme_change';

let memoryWindow: Window | undefined;
let memoryTheme: Theme | undefined;
let memoryOverridesStorage = false;

function ensureCurrentWindow(): void {
  if (memoryWindow !== window) {
    memoryWindow = window;
    memoryTheme = undefined;
    memoryOverridesStorage = false;
  }
}

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

  ensureCurrentWindow();
  if (memoryOverridesStorage) {
    return memoryTheme ?? DEFAULT_THEME;
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    memoryTheme = isSupportedTheme(stored) ? stored : DEFAULT_THEME;
    return memoryTheme;
  } catch {
    if (memoryTheme) return memoryTheme;
    // Reuse the successful pre-hydration bootstrap value if reads fail later.
    if (typeof document !== 'undefined' &&
        document.documentElement.getAttribute?.('data-theme') === 'dark') {
      return 'dark';
    }
    return DEFAULT_THEME;
  }
}

export function setPersistedTheme(theme: Theme): void {
  if (typeof window === 'undefined' || !isSupportedTheme(theme)) {
    return;
  }

  ensureCurrentWindow();
  memoryTheme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    memoryOverridesStorage = false;
  } catch {
    memoryOverridesStorage = true;
  }
}

export function syncThemeFromStorage(value: string | null): void {
  if (typeof window === 'undefined') return;
  ensureCurrentWindow();
  memoryTheme = isSupportedTheme(value) ? value : DEFAULT_THEME;
  memoryOverridesStorage = false;
}

export function applyThemeToDom(theme: Theme): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute('data-theme', theme);

  // Authoritative single runtime theme-color meta target
  const metaThemeColor =
    document.getElementById('vaylet-theme-color') ??
    document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', THEME_COLORS[theme]);
  }
}

export function commitThemeChange(newTheme: Theme): void {
  setPersistedTheme(newTheme);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  applyThemeToDom(newTheme);
}

export function shouldSkipInitialThemeSync(
  domTheme: string | null,
  reactTheme: Theme,
  persistedTheme: Theme = getPersistedTheme(),
): boolean {
  return domTheme === 'dark' && reactTheme === 'light' && persistedTheme === 'dark';
}
