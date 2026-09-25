import type { DashboardLocale } from "../../lib/i18n/locale";

const labels = {
  CHECKING_IN: { en: "Checking in", ar: "جارٍ تسجيل المركبة" },
  AWAITING_PARKING: { en: "Awaiting parking", ar: "بانتظار الركن" },
  PARKING: { en: "Parking", ar: "جارٍ الركن" },
  PARKED: { en: "Parked", ar: "مركونة" },
  REQUESTED: { en: "Retrieval requested", ar: "طُلب الاسترجاع" },
  RETRIEVING: { en: "Retrieving", ar: "جارٍ الاسترجاع" },
  READY: { en: "Ready", ar: "جاهزة للتسليم" },
  HANDOFF_PENDING: { en: "Handoff pending", ar: "بانتظار التسليم" },
  COMPLETED: { en: "Completed", ar: "مكتملة" },
} as const;

export function overviewSessionStateLabel(state: string, locale: DashboardLocale): string {
  if (Object.prototype.hasOwnProperty.call(labels, state)) {
    return labels[state as keyof typeof labels][locale];
  }
  return locale === "ar" ? "حالة غير معروفة" : "Unknown state";
}
