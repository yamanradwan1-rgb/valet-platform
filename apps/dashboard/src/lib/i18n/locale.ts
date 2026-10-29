export const dashboardLocales = ["en", "ar"] as const;
export type DashboardLocale = (typeof dashboardLocales)[number];
export type DashboardDirection = "ltr" | "rtl";

export const DASHBOARD_LOCALE_STORAGE_KEY = "vaylet_dashboard_locale";
export const DASHBOARD_LOCALE_EVENT = "vaylet-dashboard-locale-change";
export const DEFAULT_DASHBOARD_LOCALE: DashboardLocale = "en";

// Retain the selected language for this runtime if browser storage is denied.
let runtimeLocale: DashboardLocale | null = null;
let writeDenied = false;

export function isDashboardLocale(value: unknown): value is DashboardLocale {
  return value === "en" || value === "ar";
}

export function directionForLocale(
  locale: DashboardLocale,
): DashboardDirection {
  return locale === "ar" ? "rtl" : "ltr";
}

export function readDashboardLocale(): DashboardLocale {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_LOCALE;
  try {
    const stored = window.localStorage.getItem(DASHBOARD_LOCALE_STORAGE_KEY);
    if (writeDenied && runtimeLocale !== null) return runtimeLocale;
    return isDashboardLocale(stored) ? stored : DEFAULT_DASHBOARD_LOCALE;
  } catch {
    return runtimeLocale ?? DEFAULT_DASHBOARD_LOCALE;
  }
}

export function commitDashboardLocale(locale: DashboardLocale): void {
  if (typeof window === "undefined") return;
  runtimeLocale = locale;
  try {
    window.localStorage.setItem(DASHBOARD_LOCALE_STORAGE_KEY, locale);
    writeDenied = false;
  } catch {
    writeDenied = true;
  }
  document.documentElement.lang = locale;
  document.documentElement.dir = directionForLocale(locale);
  window.dispatchEvent(new Event(DASHBOARD_LOCALE_EVENT));
}

export function reconcileDashboardLocaleStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== DASHBOARD_LOCALE_STORAGE_KEY) return;
  runtimeLocale = isDashboardLocale(event.newValue)
    ? event.newValue
    : DEFAULT_DASHBOARD_LOCALE;
  writeDenied = false;
}
