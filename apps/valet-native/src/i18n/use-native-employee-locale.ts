import { useCallback, useState } from "react";
import type { EmployeeLocale } from "@valet/employee-client";

import {
  createNativeLocalePreference,
  selectNativeEmployeeLocale,
  type NativeLocalePreference,
} from "./native-locale-preference";

export function useNativeEmployeeLocale(
  suppliedPreference?: NativeLocalePreference,
) {
  const [preference] = useState(
    () => suppliedPreference ?? createNativeLocalePreference(),
  );
  const [locale, setLocaleState] = useState<EmployeeLocale>(() =>
    preference.read(),
  );
  const setLocale = useCallback(
    (next: EmployeeLocale) => {
      setLocaleState(next);
      selectNativeEmployeeLocale(preference, next);
    },
    [preference],
  );
  return { locale, setLocale } as const;
}
