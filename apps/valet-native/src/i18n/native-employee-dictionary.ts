import type { EmployeeLocale } from "@valet/employee-client";

import { nativeEmployeeArabicDictionary } from "./native-dictionary-ar";
import { nativeEmployeeEnglishDictionary } from "./native-dictionary-en";

export type NativeEmployeeDictionary = Record<
  keyof typeof nativeEmployeeEnglishDictionary,
  string
>;

const dictionaries: Record<EmployeeLocale, NativeEmployeeDictionary> = {
  ar: nativeEmployeeArabicDictionary,
  en: nativeEmployeeEnglishDictionary,
};

/** Standalone Native mirror of the current Employee Web product dictionary. */
export function getNativeEmployeeDictionary(
  locale: EmployeeLocale,
): NativeEmployeeDictionary {
  return dictionaries[locale];
}
