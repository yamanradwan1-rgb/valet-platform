"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import {
  employeeDictionary,
  isEmployeeLocale,
  localeDir,
  LOCALE_COOKIE,
  type EmployeeDictionary,
  type EmployeeLocale,
} from "../../lib/i18n/dictionary";

export interface EmployeeI18nValue {
  readonly dir: "ltr" | "rtl";
  readonly locale: EmployeeLocale;
  readonly setLocale: (locale: EmployeeLocale) => void;
  readonly t: EmployeeDictionary;
}

const EmployeeI18nContext = createContext<EmployeeI18nValue | null>(null);

function readLocaleCookie(): EmployeeLocale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.split("=")[1];
  return isEmployeeLocale(value) ? value : "en";
}

/**
 * Single authoritative locale boundary. Owns locale state, direction,
 * dictionary, and persistence. All components consume via useEmployeeI18n().
 */
export function EmployeeI18nProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [locale, setLocaleState] =
    useState<EmployeeLocale>(readLocaleCookie);

  const setLocale = useCallback((next: EmployeeLocale): void => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = localeDir(next);
    setLocaleState(next);
  }, []);

  // Sync <html> on mount from cookie (SSR hydration alignment).
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir(locale);
  }, [locale]);

  return (
    <EmployeeI18nContext.Provider
      value={{
        dir: localeDir(locale),
        locale,
        setLocale,
        t: employeeDictionary(locale),
      }}
    >
      {children}
    </EmployeeI18nContext.Provider>
  );
}

export function useEmployeeI18n(): EmployeeI18nValue {
  const ctx = useContext(EmployeeI18nContext);
  if (ctx !== null) return ctx;
  const fallback: EmployeeI18nValue = { dir: "ltr", locale: "en", setLocale: () => undefined, t: employeeDictionary("en") };
  return fallback;
}

/** Compact EN/AR switch reachable in live mode including pre-auth. */
export function LocaleToggle(): JSX.Element {
  const { locale, setLocale } = useEmployeeI18n();
  return (
    <div className="flex items-center gap-1 text-xs font-bold">
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={locale === "en" ? "text-vblue font-extrabold" : "text-muted"}
      >
        EN
      </button>
      <span className="text-muted">/</span>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={locale === "ar" ? "text-vblue font-extrabold" : "text-muted"}
      >
        عربي
      </button>
    </div>
  );
}
