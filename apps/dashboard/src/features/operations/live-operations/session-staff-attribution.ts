import type {
  HistoricalStaffName,
  LiveSessionOverviewEntry,
  SessionOverviewEntry,
} from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { operationsCopy } from "../operations-copy";
import { operationalStaffName } from "../operational-staff";

export type StaffCellAttribution = {
  readonly primary: string;
  readonly secondary: string | null;
  readonly source: "CURRENT" | "PARKING_HISTORY" | "UNKNOWN" | "UNASSIGNED";
};

export function historicalStaffName(
  value: HistoricalStaffName | null,
): string | null {
  return value === null ? null : `${value.firstName} ${value.lastName}`;
}

export function hasLiveSessionHistory(
  item: SessionOverviewEntry | LiveSessionOverviewEntry,
): item is LiveSessionOverviewEntry {
  return "parkingCompletionProof" in item;
}

/**
 * Current tasks always take precedence. In particular a queued/unassigned
 * Retrieval MUST NOT inherit the previously completed Parking actor.
 * The old shared SessionOverviewEntry is accepted here only to keep the
 * pre-implementation diagnostic renderable; production reads the strict
 * LiveSessionOverviewEntry from /overview/live-sessions.
 */
export function liveStaffCell(
  item: SessionOverviewEntry | LiveSessionOverviewEntry,
  locale: DashboardLocale,
): StaffCellAttribution {
  const t = operationsCopy(locale);
  if (item.activeTask !== null) {
    const assignee = item.activeTask.assignee;
    return {
      primary: operationalStaffName(assignee, locale),
      secondary: assignee === null ? null : t.liveCurrentAssignment,
      source: assignee === null ? "UNASSIGNED" : "CURRENT",
    };
  }
  if (item.state === "PARKED" && hasLiveSessionHistory(item)) {
    const parker =
      item.parkingCompletionProof === "PROVEN"
        ? historicalStaffName(item.parkedBy)
        : null;
    if (parker !== null) {
      return {
        primary: parker,
        secondary: t.liveParkedBy,
        source: "PARKING_HISTORY",
      };
    }
    if (item.parkingCompletionProof === "PROVEN") {
      return {
        primary: t.liveUnknownStaff,
        secondary: t.liveParkedBy,
        source: "PARKING_HISTORY",
      };
    }
    return {
      primary: t.liveUnknownStaff,
      secondary: null,
      source: "UNKNOWN",
    };
  }
  return {
    primary: t.unassigned,
    secondary: null,
    source: "UNASSIGNED",
  };
}
