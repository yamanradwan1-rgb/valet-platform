"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { ar, en, type TranslationKey } from "./dictionaries";
import {
  commitDashboardLocale,
  DASHBOARD_LOCALE_EVENT,
  directionForLocale,
  readDashboardLocale,
  type DashboardLocale,
} from "./locale";

interface LocaleContextValue {
  readonly locale: DashboardLocale;
  readonly direction: "ltr" | "rtl";
  readonly setLocale: (locale: DashboardLocale) => void;
  readonly t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", callback);
  window.addEventListener(DASHBOARD_LOCALE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(DASHBOARD_LOCALE_EVENT, callback);
  };
}

function serverLocaleSnapshot(): DashboardLocale {
  return "en";
}

export function DashboardLocaleProvider({ children }: { readonly children: ReactNode }) {
  const locale = useSyncExternalStore<DashboardLocale>(
    subscribe,
    readDashboardLocale,
    serverLocaleSnapshot,
  );
  const direction = directionForLocale(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [direction, locale]);
  const setLocale = useCallback((next: DashboardLocale) => commitDashboardLocale(next), []);
  const t = useCallback(
    (key: TranslationKey) => (locale === "ar" ? ar : en)[key],
    [locale],
  );
  const value = useMemo(() => ({ direction, locale, setLocale, t }), [direction, locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useDashboardLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useDashboardLocale requires DashboardLocaleProvider");
  return value;
}
