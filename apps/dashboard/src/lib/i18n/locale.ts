export const dashboardLocales = ["en", "ar"] as const;
export type DashboardLocale = (typeof dashboardLocales)[number];
export type DashboardDirection = "ltr" | "rtl";

export const DASHBOARD_LOCALE_STORAGE_KEY = "vaylet_dashboard_locale";
export const DASHBOARD_LOCALE_EVENT = "vaylet-dashboard-locale-change";
export const DEFAULT_DASHBOARD_LOCALE: DashboardLocale = "en";

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
    return isDashboardLocale(stored) ? stored : DEFAULT_DASHBOARD_LOCALE;
  } catch {
    return DEFAULT_DASHBOARD_LOCALE;
  }
}

export function commitDashboardLocale(locale: DashboardLocale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DASHBOARD_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Presentation preference persistence is best effort.
  }
  document.documentElement.lang = locale;
  document.documentElement.dir = directionForLocale(locale);
  window.dispatchEvent(new Event(DASHBOARD_LOCALE_EVENT));
}
