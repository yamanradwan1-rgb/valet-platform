import type { Screen, Tab } from "../../types/employee-ui";

/**
 * DEC-066 §1/§2 navigation model for Live mode.
 * Kept separate from EmployeeApp so activation gates and workflow pinning
 * stay testable without rendering the whole application.
 */

export const livePermittedScreens = new Set<Screen>([
  "task-queue",
  "check-in",
  "parking",
  "incident",
  "retrieval",
  "guest-access",
  "shift-summary",
]);

/** Operational workflows pin the bottom navigation while effective. */
export const liveWorkflowScreens = new Set<Screen>([
  "check-in",
  "parking",
  "retrieval",
  "incident",
  "guest-access",
]);

/** DEC-066 §1: only surfaces with truthful Live implementations in VUI-011A. */
export const liveEnabledTabs: Partial<Record<Tab, boolean>> = {
  scan: false,
  vehicles: false,
};

export function getActiveTab(s: Screen): Tab {
  if (s === "vehicles-list") return "vehicles";
  if (s === "scan-hub") return "scan";
  if (s === "shift-summary") return "shift";
  return "home";
}

/** Bottom-nav tab target screen; null tabs (Vehicles/Scan) are not yet Live. */
export function topLevelScreenForTab(tab: Tab): Screen | null {
  if (tab === "home") return "task-queue";
  if (tab === "shift") return "shift-summary";
  return null;
}
