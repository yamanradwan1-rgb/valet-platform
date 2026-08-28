const DEFAULT_DASHBOARD_PATH = "/overview";

/** Returns a dashboard-only relative continuation path or the safe default. */
export function safeDashboardNext(value: string | null): string {
  if (value === null || value.length === 0) return DEFAULT_DASHBOARD_PATH;
  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_DASHBOARD_PATH;
  }
  try {
    const parsed = new URL(value, "https://dashboard.invalid");
    if (parsed.origin !== "https://dashboard.invalid" || parsed.pathname === "/sign-in") {
      return DEFAULT_DASHBOARD_PATH;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_DASHBOARD_PATH;
  }
}
