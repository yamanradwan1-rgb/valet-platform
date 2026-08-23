"use client";

import { createContext, useContext, type JSX, type ReactNode } from "react";

import {
  employeeDictionary,
  localeDir,
  type EmployeeDictionary,
  type EmployeeLocale,
} from "../../lib/i18n/dictionary";

export interface EmployeeI18nValue {
  readonly dir: "ltr" | "rtl";
  readonly locale: EmployeeLocale;
  readonly t: EmployeeDictionary;
}

const EmployeeI18nContext = createContext<EmployeeI18nValue | null>(null);

export function EmployeeI18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: EmployeeLocale;
}): JSX.Element {
  const value: EmployeeI18nValue = {
    dir: localeDir(locale),
    locale,
    t: employeeDictionary(locale),
  };
  return (
    <EmployeeI18nContext.Provider value={value}>
      {children}
    </EmployeeI18nContext.Provider>
  );
}

export function useEmployeeI18n(): EmployeeI18nValue {
  const ctx = useContext(EmployeeI18nContext);
  // English fallback keeps SSR/tests safe when no provider wraps the tree.
  return ctx ?? { dir: "ltr", locale: "en", t: employeeDictionary("en") };
}
