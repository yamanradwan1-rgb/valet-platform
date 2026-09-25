import type {
  DashboardSessionState,
  DashboardTaskStatus,
  SessionOverviewEntry,
  TaskOverviewEntry,
} from "@valet/contracts";

import type { DashboardLocale } from "../../lib/i18n/locale";

const sessionStateLabels: Readonly<
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

const taskStatusLabels: Readonly<
  Record<DashboardTaskStatus, Readonly<Record<DashboardLocale, string>>>
> = {
  ACCEPTED: { en: "Accepted", ar: "مقبولة" },
  ASSIGNED: { en: "Assigned", ar: "مسندة" },
  CANCELLED: { en: "Cancelled", ar: "ملغاة" },
  COMPLETED: { en: "Completed", ar: "مكتملة" },
  IN_PROGRESS: { en: "In Progress", ar: "قيد التنفيذ" },
  QUEUED: { en: "Queued", ar: "في قائمة الانتظار" },
};

const taskTypeLabels: Readonly<
  Record<TaskOverviewEntry["taskType"], Readonly<Record<DashboardLocale, string>>>
> = {
  PARKING: { en: "Parking", ar: "اصطفاف" },
  RETRIEVAL: { en: "Retrieval", ar: "استرجاع" },
};

export function operationsSessionStateLabel(
  state: string,
  locale: DashboardLocale,
): string {
  const known = sessionStateLabels[state as DashboardSessionState];
  if (known !== undefined) return known[locale];
  const literal = state.replaceAll("_", " ").trim() || "UNKNOWN";
  return locale === "ar" ? `حالة: ${literal}` : `State: ${literal}`;
}

export function operationsTaskStatusLabel(
  status: DashboardTaskStatus,
  locale: DashboardLocale,
): string {
  return taskStatusLabels[status][locale];
}

export function operationsTaskTypeLabel(
  type: TaskOverviewEntry["taskType"],
  locale: DashboardLocale,
): string {
  return taskTypeLabels[type][locale];
}

export function operationsAssignmentLabel(
  membershipId: string | null,
  locale: DashboardLocale,
): string {
  if (membershipId === null) return locale === "ar" ? "غير مسندة" : "Unassigned";
  return locale === "ar" ? "مسندة" : "Assigned";
}

export function operationsVehicleLabel(item: SessionOverviewEntry): string | null {
  return (
    item.vehicle.plateNumberNormalized?.trim() ||
    item.vehicle.temporaryDescriptor?.trim() ||
    null
  );
}

export function formatOperationsTime(
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

export function r04PresentationCopy(locale: DashboardLocale) {
  if (locale === "ar") {
    return {
      allStatuses: "كل الحالات",
      allTaskTypes: "كل الأنواع",
      filtersLoadedPageOnly: "التصفية على الصفحة المحمّلة فقط",
      loadedPageOnly: "التصفية والبحث على الصفحة المحمّلة فقط",
      searchVehicle: "ابحث في اللوحة أو الوصف في الصفحة المحمّلة",
    } as const;
  }
  return {
    allStatuses: "All statuses",
    allTaskTypes: "All types",
    filtersLoadedPageOnly: "Filters apply to the loaded page only",
    loadedPageOnly: "Search and filters apply to the loaded page only",
    searchVehicle: "Search loaded plate or descriptor",
  } as const;
}
