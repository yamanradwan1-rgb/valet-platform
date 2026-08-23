import { employeeArabicDictionary } from "./dictionary-ar";
import { employeeEnglishDictionary } from "./dictionary-en";

export type EmployeeLocale = "en" | "ar";
export type EmployeeDictionary = Record<
  keyof typeof employeeEnglishDictionary,
  string
>;

export const LOCALE_COOKIE = "vaylet_employee_locale";

export function isEmployeeLocale(value: unknown): value is EmployeeLocale {
  return value === "en" || value === "ar";
}

export function localeDir(locale: EmployeeLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function readEmployeeLocale(cookieHeader?: string): EmployeeLocale {
  if (typeof cookieHeader !== "string") return "en";
  const match = cookieHeader
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.split("=")[1];
  return isEmployeeLocale(value) ? value : "en";
}

const dictionaries: Record<EmployeeLocale, EmployeeDictionary> = {
  ar: employeeArabicDictionary,
  en: employeeEnglishDictionary,
};

export function employeeDictionary(locale: EmployeeLocale): EmployeeDictionary {
  return dictionaries[locale];
}
