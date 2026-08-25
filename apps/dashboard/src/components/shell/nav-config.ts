import type { TranslationKey } from "../../i18n/translations/types";

export interface NavItem {
  readonly path: string;
  readonly labelKey: TranslationKey;
}

export interface NavSection {
  readonly labelKey: TranslationKey;
  readonly items: readonly NavItem[];
}

/**
 * Active Management Dashboard navigation — only surfaces backed by current
 * accepted LOCATION_MANAGER authority. Admin/platform-only and unimplemented
 * surfaces are deliberately absent. This is the single source for the sidebar
 * and is asserted by nav-config.test.ts.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    labelKey: "shell.navOperations",
    items: [
      { path: "/overview", labelKey: "shell.navOverview" },
      { path: "/live-operations", labelKey: "shell.navLiveOperations" },
      { path: "/sessions", labelKey: "shell.navSessions" },
      { path: "/retrieval-queue", labelKey: "shell.navRetrievalQueue" },
      { path: "/tasks", labelKey: "shell.navTasks" },
      { path: "/active-shifts", labelKey: "shell.navActiveShifts" },
      { path: "/keys", labelKey: "shell.navKeys" },
      { path: "/incidents", labelKey: "shell.navIncidents" },
    ],
  },
  {
    labelKey: "shell.navMaps",
    items: [{ path: "/maps-zones", labelKey: "shell.navMapsZones" }],
  },
  {
    labelKey: "shell.navFinancial",
    items: [
      { path: "/financial", labelKey: "shell.navFinancialOverview" },
      { path: "/analytics", labelKey: "shell.navAnalytics" },
      { path: "/reports", labelKey: "shell.navReports" },
    ],
  },
  {
    labelKey: "shell.navConfiguration",
    items: [
      { path: "/location-settings", labelKey: "shell.navLocationSettings" },
      { path: "/branding", labelKey: "shell.navBranding" },
      { path: "/subscription", labelKey: "shell.navSubscription" },
    ],
  },
];

/** Routes that must never appear in the active dashboard navigation. */
export const FORBIDDEN_NAV_PATHS: readonly string[] = [
  "/authorized-locations",
  "/payments",
  "/fee-validation",
  "/customers",
  "/roles",
  "/integrations",
  "/audit",
  "/platform",
];

/** Stable icon identifiers for sidebar items. */
export type IconName =
  | "grid"
  | "map"
  | "car"
  | "clock"
  | "list"
  | "users"
  | "key"
  | "alert"
  | "bank"
  | "chart"
  | "file"
  | "settings"
  | "palette"
  | "star"
  | "close";
