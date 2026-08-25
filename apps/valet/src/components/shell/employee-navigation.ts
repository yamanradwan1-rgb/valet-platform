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
  // VUI-011B: truthful context-aware Scan Hub (DEC-066 §5).
  "scan-hub",
  // VUI-011C: authoritative employee vehicle-directory read (DEC-066 §6–§10).
  "vehicles-list",
]);

/** Operational workflows pin the bottom navigation while effective. */
export const liveWorkflowScreens = new Set<Screen>([
  "check-in",
  "parking",
  "retrieval",
  "incident",
  "guest-access",
]);

/**
 * DEC-066 §1: only surfaces with truthful Live implementations are enabled.
 * VUI-011A activated Tasks/Shift; VUI-011B activated Scan; VUI-011C
 * activates Vehicles behind its authoritative directory read.
 */
export const liveEnabledTabs: Partial<Record<Tab, boolean>> = {
  scan: true,
  vehicles: true,
};

export function getActiveTab(s: Screen): Tab {
  if (s === "vehicles-list") return "vehicles";
  if (s === "scan-hub") return "scan";
  if (s === "shift-summary") return "shift";
  return "home";
}

/** Bottom-nav tab target screen; every tab now routes to its Live surface. */
export function topLevelScreenForTab(tab: Tab): Screen | null {
  if (tab === "home") return "task-queue";
  if (tab === "vehicles") return "vehicles-list";
  if (tab === "shift") return "shift-summary";
  // VUI-011B: the Scan tab now routes to its truthful Live surface.
  if (tab === "scan") return "scan-hub";
  return null;
}
