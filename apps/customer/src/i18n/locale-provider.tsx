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
  commitLocaleChange,
  DEFAULT_LOCALE,
  getDirectionForLocale,
  getPersistedLocale,
  LOCALE_CHANGE_EVENT,
  LOCALE_STORAGE_KEY,
  syncLocaleFromStorage,
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

function subscribeToLocale(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== LOCALE_STORAGE_KEY) return;
    syncLocaleFromStorage(event.newValue);
    callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCALE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
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

  // Synchronize document attributes and unmask pre-hydration visibility guard only when locale matches
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = direction;

      const hasPersistedArGuard = document.documentElement.classList.contains('vaylet-persisted-ar');
      if (hasPersistedArGuard) {
        if (locale === 'ar') {
          document.documentElement.classList.remove('vaylet-persisted-ar');
          document.documentElement.classList.add('vaylet-hydrated');
        }
      } else {
        document.documentElement.classList.add('vaylet-hydrated');
      }
    }
  }, [locale, direction]);

  const setLocale = useCallback((newLocale: Locale) => {
    commitLocaleChange(newLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    const nextLocale: Locale = locale === 'en' ? 'ar' : 'en';
    commitLocaleChange(nextLocale);
  }, [locale]);

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
