import { File, Paths } from "expo-file-system";
import { isEmployeeLocale, type EmployeeLocale } from "@valet/employee-client";

const LOCALE_PREFERENCE_FILE = "employee-locale";

export interface NativeLocalePreference {
  readonly read: () => EmployeeLocale;
  readonly write: (locale: EmployeeLocale) => boolean;
}

export interface NativeLocalePreferenceFile {
  readonly exists: boolean;
  readonly textSync: () => string;
  readonly write: (value: string) => void;
}

export function parseNativeLocalePreference(value: unknown): EmployeeLocale {
  if (typeof value !== "string") return "en";
  const normalized = value.trim();
  return isEmployeeLocale(normalized) ? normalized : "en";
}

export function createNativeLocalePreference(
  file: NativeLocalePreferenceFile = new File(
    Paths.document,
    LOCALE_PREFERENCE_FILE,
  ),
): NativeLocalePreference {
  return {
    read: () => {
      try {
        return file.exists
          ? parseNativeLocalePreference(file.textSync())
          : "en";
      } catch {
        return "en";
      }
    },
    write: (locale) => {
      try {
        file.write(locale);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function selectNativeEmployeeLocale(
  preference: NativeLocalePreference,
  locale: EmployeeLocale,
): EmployeeLocale {
  preference.write(locale);
  return locale;
}
