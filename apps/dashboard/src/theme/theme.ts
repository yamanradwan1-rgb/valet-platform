export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "light";
const THEME_STORAGE_KEY = "vaylet.dashboard.theme";
export const THEME_CHANGE_EVENT = "vaylet:theme-change";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function safeWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

export function getPersistedTheme(): Theme {
  const window = safeWindow();
  if (window === null) return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyThemeToDom(theme: Theme): void {
  const document = globalThis.document;
  if (document === undefined) return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function commitThemeChange(theme: Theme): void {
  applyThemeToDom(theme);
  const window = safeWindow();
  if (window === null) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Persistence is best-effort.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
