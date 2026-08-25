export type Locale = "en" | "ar";
export type Direction = "ltr" | "rtl";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALES: readonly Locale[] = ["en", "ar"];
const LOCALE_STORAGE_KEY = "vaylet.dashboard.locale";
export const LOCALE_CHANGE_EVENT = "vaylet:locale-change";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ar";
}

export function getDirectionForLocale(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

function safeWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

export function getPersistedLocale(): Locale {
  const window = safeWindow();
  if (window === null) return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function commitLocaleChange(locale: Locale): void {
  applyLocaleToDom(locale);
  const window = safeWindow();
  if (window === null) return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persistence is best-effort; the in-memory context still switches.
  }
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
}

export function applyLocaleToDom(locale: Locale): void {
  const document = globalThis.document;
  if (document === undefined) return;
  document.documentElement.lang = locale;
  document.documentElement.dir = getDirectionForLocale(locale);
}
