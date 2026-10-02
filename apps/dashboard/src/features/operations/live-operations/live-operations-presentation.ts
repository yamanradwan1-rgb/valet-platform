import type {
  DashboardTaskStatus,
  DashboardSessionState,
  RetrievalQueueEntry,
  SessionOverviewEntry,
  SessionStateCountsResponse,
  SessionOverviewFilter,
} from "@valet/contracts";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import {
  formatOperationsTime,
  operationsSessionStateLabel,
  operationsTaskStatusLabel,
  operationsVehicleLabel,
} from "../operations-presentation";

export type LiveOperationsFilter = SessionOverviewFilter;

const filterLabels: Readonly<
  Record<LiveOperationsFilter, Readonly<Record<DashboardLocale, string>>>
> = {
  ALL: { en: "All", ar: "الكل" },
  CHECK_IN: { en: "Check-in", ar: "تسجيل المركبة" },
  PARKED: { en: "Parked", ar: "مصطفّة" },
  REQUESTED: { en: "Waiting Retrieval", ar: "بانتظار الاسترجاع" },
  IN_TRANSIT: { en: "In Transit", ar: "قيد الحركة" },
  READY_HANDOFF: { en: "Ready / Handoff", ar: "جاهزة / التسليم" },
};

export const liveOperationsFilters = Object.freeze([
  "ALL",
  "CHECK_IN",
  "PARKED",
  "REQUESTED",
  "IN_TRANSIT",
  "READY_HANDOFF",
] satisfies readonly LiveOperationsFilter[]);

export function liveOperationsKpis(response: SessionStateCountsResponse): {
  readonly active: number;
  readonly requested: number;
  readonly inTransit: number;
  readonly handoffPending: number;
} {
  const counts = new Map(
    response.counts.map((entry) => [entry.state, entry.count]),
  );
  const count = (state: DashboardSessionState) => counts.get(state) ?? 0;
  return {
    active: response.counts.reduce(
      (sum, entry) => sum + (entry.state === "COMPLETED" ? 0 : entry.count),
      0,
    ),
    requested: count("REQUESTED"),
    inTransit: count("PARKING") + count("RETRIEVING"),
    handoffPending: count("HANDOFF_PENDING"),
  };
}

export function liveFilterLabel(
  filter: LiveOperationsFilter,
  locale: DashboardLocale,
): string {
  return filterLabels[filter][locale];
}

export function liveSessionStateLabel(
  state: string,
  locale: DashboardLocale,
): string {
  return operationsSessionStateLabel(state, locale);
}

export function liveRetrievalStatusLabel(
  status: RetrievalQueueEntry["status"],
  locale: DashboardLocale,
): string {
  if (status === "OPEN") return locale === "ar" ? "مفتوح" : "Open";
  return locale === "ar" ? "مقبول" : "Accepted";
}

export function liveRequesterTypeLabel(
  requesterType: RetrievalQueueEntry["requesterType"],
  locale: DashboardLocale,
): string {
  if (requesterType === "CUSTOMER")
    return locale === "ar" ? "العميل" : "Customer";
  return locale === "ar" ? "الموظفون" : "Staff";
}

export function liveTaskStatusLabel(
  status: DashboardTaskStatus,
  locale: DashboardLocale,
): string {
  return operationsTaskStatusLabel(status, locale);
}

export function liveVehicleLabel(item: SessionOverviewEntry): string | null {
  return operationsVehicleLabel(item);
}

export function formatLiveOperationsTime(
  value: string,
  timezone: string,
  locale: DashboardLocale,
): string {
  return formatOperationsTime(value, timezone, locale);
}
