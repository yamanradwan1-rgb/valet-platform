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

/**
 * Single authoritative locale boundary. The server resolves the locale from
 * the cookie and passes it as initialLocale; the provider owns all subsequent
 * state transitions (cookie write + html lang/dir + re-render). This prevents
 * server-EN / client-AR hydration divergence.
 */
export function EmployeeI18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: EmployeeLocale;
}): JSX.Element {
  const [locale, setLocaleState] =
    useState<EmployeeLocale>(initialLocale);

  const setLocale = useCallback((next: EmployeeLocale): void => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = localeDir(next);
    setLocaleState(next);
  }, []);

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
  return {
    dir: "ltr",
    locale: "en",
    setLocale: () => undefined,
    t: employeeDictionary("en"),
  };
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
