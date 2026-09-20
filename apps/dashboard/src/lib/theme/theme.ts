export type DashboardTheme = "light" | "dark";
export const DASHBOARD_THEME_STORAGE_KEY = "vaylet_dashboard_theme";
export const DASHBOARD_THEME_EVENT = "vaylet-dashboard-theme-change";

export function readDashboardTheme(): DashboardTheme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function commitDashboardTheme(theme: DashboardTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, theme);
  } catch {
    // Presentation preference persistence is best effort.
  }
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(DASHBOARD_THEME_EVENT));
}
