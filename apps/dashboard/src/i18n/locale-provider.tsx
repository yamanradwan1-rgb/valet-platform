"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  applyLocaleToDom,
  commitLocaleChange,
  DEFAULT_LOCALE,
  getDirectionForLocale,
  getPersistedLocale,
  LOCALE_CHANGE_EVENT,
  type Direction,
  type Locale,
} from "./locale";
import { arTranslations } from "./translations/ar";
import { enTranslations } from "./translations/en";
import type {
  TranslationDictionary,
  TranslationKey,
} from "./translations/types";

export interface LocaleContextValue {
  readonly locale: Locale;
  readonly direction: Direction;
  readonly isRtl: boolean;
  readonly setLocale: (locale: Locale) => void;
  readonly toggleLocale: () => void;
  /**
   * Render-time translation lookup. Translations are resolved during render
   * from typed dictionaries; DOM text is never rewritten after the fact.
   */
  readonly t: (key: TranslationKey) => string;
}

const dictionaries: Readonly<Record<Locale, TranslationDictionary>> = {
  en: enTranslations,
  ar: arTranslations,
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);

function subscribeToLocale(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", callback);
  window.addEventListener(LOCALE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCALE_CHANGE_EVENT, callback);
  };
}

function getClientLocaleSnapshot(): Locale {
  return getPersistedLocale();
}

function getServerLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const storedLocale = useSyncExternalStore(
    subscribeToLocale,
    getClientLocaleSnapshot,
    getServerLocaleSnapshot,
  );
  const locale = storedLocale;
  const direction = useMemo(() => getDirectionForLocale(locale), [locale]);
  const isRtl = direction === "rtl";

  useEffect(() => {
    applyLocaleToDom(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    commitLocaleChange(next);
  }, []);

  const toggleLocale = useCallback(() => {
    commitLocaleChange(locale === "en" ? "ar" : "en");
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey): string =>
      dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key],
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, direction, isRtl, setLocale, toggleLocale, t }),
    [locale, direction, isRtl, setLocale, toggleLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useTranslation(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (context === null) {
    throw new Error("useTranslation must be used within a LocaleProvider");
  }
  return context;
}
