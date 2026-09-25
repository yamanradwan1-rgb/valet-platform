import type {
  DashboardTaskStatus,
  DashboardSessionState,
  RetrievalQueueEntry,
  SessionOverviewEntry,
  SessionStateCountsResponse,
} from "@valet/contracts";

import type { DashboardLocale } from "../../../lib/i18n/locale";

export type LiveOperationsFilter =
  | "ALL"
  | "CHECK_IN"
  | "PARKED"
  | "REQUESTED"
  | "IN_TRANSIT"
  | "READY_HANDOFF";

const filterStates: Readonly<Record<
  Exclude<LiveOperationsFilter, "ALL">,
  readonly DashboardSessionState[]
>> = {
  CHECK_IN: ["CHECKING_IN", "AWAITING_PARKING"],
  PARKED: ["PARKED"],
  REQUESTED: ["REQUESTED"],
  IN_TRANSIT: ["PARKING", "RETRIEVING"],
  READY_HANDOFF: ["READY", "HANDOFF_PENDING"],
};

const stateLabels: Readonly<
  Record<DashboardSessionState, Readonly<Record<DashboardLocale, string>>>
> = {
  AWAITING_PARKING: { en: "Awaiting Parking", ar: "بانتظار الاصطفاف" },
  CHECKING_IN: { en: "Checking In", ar: "جارٍ تسجيل المركبة" },
  COMPLETED: { en: "Completed", ar: "مكتملة" },
  HANDOFF_PENDING: { en: "Handoff Pending", ar: "بانتظار التسليم" },
  PARKED: { en: "Parked", ar: "مصطفّة" },
  PARKING: { en: "Parking", ar: "جارٍ الاصطفاف" },
  READY: { en: "Ready", ar: "جاهزة" },
  REQUESTED: { en: "Retrieval Requested", ar: "تم طلب الاسترجاع" },
  RETRIEVING: { en: "Retrieving", ar: "جارٍ الاسترجاع" },
};

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

export function liveOperationsKpis(
  response: SessionStateCountsResponse,
): {
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

export function filterLiveSessions(
  items: readonly SessionOverviewEntry[],
  filter: LiveOperationsFilter,
): readonly SessionOverviewEntry[] {
  if (filter === "ALL") return items;
  const states = filterStates[filter];
  return items.filter((item) => states.includes(item.state));
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
  const known = stateLabels[state as DashboardSessionState];
  if (known !== undefined) return known[locale];
  const literal = state.replaceAll("_", " ").trim() || "UNKNOWN";
  return locale === "ar" ? `حالة: ${literal}` : `State: ${literal}`;
}

export function liveAssignmentLabel(
  membershipId: string | null,
  locale: DashboardLocale,
): string {
  if (membershipId === null) return locale === "ar" ? "غير مسندة" : "Unassigned";
  return locale === "ar" ? "مسندة" : "Assigned";
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
  if (requesterType === "CUSTOMER") return locale === "ar" ? "العميل" : "Customer";
  return locale === "ar" ? "الموظفون" : "Staff";
}

export function liveTaskStatusLabel(
  status: DashboardTaskStatus,
  locale: DashboardLocale,
): string {
  const labels: Record<DashboardTaskStatus, readonly [string, string]> = {
    ACCEPTED: ["Accepted", "مقبولة"],
    ASSIGNED: ["Assigned", "مسندة"],
    CANCELLED: ["Cancelled", "ملغاة"],
    COMPLETED: ["Completed", "مكتملة"],
    IN_PROGRESS: ["In Progress", "قيد التنفيذ"],
    QUEUED: ["Queued", "في قائمة الانتظار"],
  };
  return labels[status][locale === "ar" ? 1 : 0];
}

export function liveVehicleLabel(item: SessionOverviewEntry): string | null {
  return (
    item.vehicle.plateNumberNormalized?.trim() ||
    item.vehicle.temporaryDescriptor?.trim() ||
    null
  );
}

export function formatLiveOperationsTime(
  value: string,
  timezone: string,
  locale: DashboardLocale,
): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-US", {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return locale === "ar" ? "الوقت غير متاح" : "Time unavailable";
  }
}
