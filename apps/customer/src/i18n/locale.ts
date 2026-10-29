export type Locale = 'en' | 'ar';
export type Direction = 'ltr' | 'rtl';

export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'ar'];

export const LOCALE_DIRECTIONS: Readonly<Record<Locale, Direction>> = {
  en: 'ltr',
  ar: 'rtl',
};

export const LOCALE_STORAGE_KEY = 'vaylet_guest_locale';
export const LOCALE_CHANGE_EVENT = 'vaylet_locale_change';

// This is a presentation preference only. Guest credentials remain in their separate secure flow.
let memoryWindow: Window | undefined;
let memoryLocale: Locale | undefined;
let memoryOverridesStorage = false;

function ensureCurrentWindow(): void {
  if (memoryWindow !== window) {
    memoryWindow = window;
    memoryLocale = undefined;
    memoryOverridesStorage = false;
  }
}

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function getPersistedLocale(): Locale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  ensureCurrentWindow();
  if (memoryOverridesStorage) {
    return memoryLocale ?? DEFAULT_LOCALE;
  }

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) {
      return stored;
    }
  } catch {
    if (memoryLocale) return memoryLocale;
    // The bootstrap script may have read Arabic before storage became inaccessible.
    if (typeof document !== 'undefined' &&
        document.documentElement.classList?.contains('vaylet-persisted-ar')) {
      return 'ar';
    }
    return DEFAULT_LOCALE;
  }

  return DEFAULT_LOCALE;
}

export function setPersistedLocale(locale: Locale): void {
  if (typeof window === 'undefined' || !isSupportedLocale(locale)) {
    return;
  }

  ensureCurrentWindow();
  memoryLocale = locale;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    memoryOverridesStorage = false;
  } catch {
    // Keep the mounted preference reactive even when storage writes are denied.
    memoryOverridesStorage = true;
  }
}

export function syncLocaleFromStorage(value: string | null): void {
  if (typeof window === 'undefined') return;
  ensureCurrentWindow();
  memoryLocale = isSupportedLocale(value) ? value : DEFAULT_LOCALE;
  memoryOverridesStorage = false;
}

export function getDirectionForLocale(locale: Locale): Direction {
  return LOCALE_DIRECTIONS[locale] ?? 'ltr';
}

export function commitLocaleChange(newLocale: Locale): void {
  setPersistedLocale(newLocale);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = newLocale;
    document.documentElement.dir = getDirectionForLocale(newLocale);
  }
}
