'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { interpolateTranslation } from './interpolate';
import {
  DEFAULT_LOCALE,
  getDirectionForLocale,
  getPersistedLocale,
  setPersistedLocale,
  type Direction,
  type Locale,
} from './locale';
import { arTranslations } from './translations/ar';
import { enTranslations } from './translations/en';
import type { TranslationDictionary, TranslationKey } from './translations/types';

export interface LocaleContextValue {
  readonly locale: Locale;
  readonly direction: Direction;
  readonly isRtl: boolean;
  readonly setLocale: (locale: Locale) => void;
  readonly toggleLocale: () => void;
  readonly t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const dictionaries: Readonly<Record<Locale, TranslationDictionary>> = {
  en: enTranslations,
  ar: arTranslations,
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);

const LOCALE_CHANGE_EVENT = 'vaylet_locale_change';

function subscribeToLocale(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener('storage', callback);
  window.addEventListener(LOCALE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(LOCALE_CHANGE_EVENT, callback);
  };
}

function getClientLocaleSnapshot(): Locale {
  return getPersistedLocale();
}

function getServerLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  readonly children: React.ReactNode;
  readonly initialLocale?: Locale | undefined;
}) {
  const storeLocale = useSyncExternalStore(
    subscribeToLocale,
    getClientLocaleSnapshot,
    getServerLocaleSnapshot,
  );

  const locale: Locale = initialLocale ?? storeLocale;
  const direction = useMemo(() => getDirectionForLocale(locale), [locale]);
  const isRtl = direction === 'rtl';

  // Synchronize document direction and language attributes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = direction;
    }
  }, [locale, direction]);

  const setLocale = useCallback((newLocale: Locale) => {
    setPersistedLocale(newLocale);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
      document.documentElement.dir = getDirectionForLocale(newLocale);
    }
  }, []);

  const toggleLocale = useCallback(() => {
    const nextLocale: Locale = locale === 'en' ? 'ar' : 'en';
    setLocale(nextLocale);
  }, [locale, setLocale]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
      const template = dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
      return interpolateTranslation(template, params);
    },
    [locale],
  );

  const contextValue = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction,
      isRtl,
      setLocale,
      toggleLocale,
      t,
    }),
    [locale, direction, isRtl, setLocale, toggleLocale, t],
  );

  return <LocaleContext.Provider value={contextValue}>{children}</LocaleContext.Provider>;
}

export function useTranslation(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LocaleProvider');
  }
  return context;
}
