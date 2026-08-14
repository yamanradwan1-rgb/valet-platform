export type Locale = 'en' | 'ar';
export type Direction = 'ltr' | 'rtl';

export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'ar'];

export const LOCALE_DIRECTIONS: Readonly<Record<Locale, Direction>> = {
  en: 'ltr',
  ar: 'rtl',
};

export const LOCALE_STORAGE_KEY = 'vaylet_guest_locale';

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function getPersistedLocale(): Locale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) {
      return stored;
    }
  } catch {
    // Storage access may fail in restricted/private contexts
  }

  return DEFAULT_LOCALE;
}

export function setPersistedLocale(locale: Locale): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (isSupportedLocale(locale)) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // Storage access may fail in restricted/private contexts
  }
}

export function getDirectionForLocale(locale: Locale): Direction {
  return LOCALE_DIRECTIONS[locale] ?? 'ltr';
}
