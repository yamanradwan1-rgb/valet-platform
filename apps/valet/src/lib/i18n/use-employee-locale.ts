"use client";

import { useCallback, useState } from "react";

import {
  employeeDictionary,
  isEmployeeLocale,
  localeDir,
  LOCALE_COOKIE,
  type EmployeeDictionary,
  type EmployeeLocale,
} from "./dictionary";

function readLocaleCookie(): EmployeeLocale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.split("=")[1];
  return isEmployeeLocale(value) ? value : "en";
}

function persistLocale(locale: EmployeeLocale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export interface UseEmployeeLocaleResult {
  readonly dir: "ltr" | "rtl";
  readonly locale: EmployeeLocale;
  readonly setLocale: (locale: EmployeeLocale) => void;
  readonly t: EmployeeDictionary;
}

/**
 * Client locale state backed by a first-party cookie so the server can
 * render <html lang dir> on the next request. Pure presentation concern.
 */
export function useEmployeeLocale(): UseEmployeeLocaleResult {
  const [locale, setLocaleState] = useState<EmployeeLocale>(() =>
    readLocaleCookie(),
  );

  const setLocale = useCallback((next: EmployeeLocale) => {
    persistLocale(next);
    setLocaleState(next);
    // Direction must flip immediately for the live session; the cookie
    // makes it durable for the server-rendered shell too.
    document.documentElement.lang = next;
    document.documentElement.dir = localeDir(next);
  }, []);

  return {
    dir: localeDir(locale),
    locale,
    setLocale,
    t: employeeDictionary(locale),
  };
}
