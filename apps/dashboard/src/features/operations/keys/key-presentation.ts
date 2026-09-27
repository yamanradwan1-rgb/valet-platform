import type { KeySlotOverviewEntry } from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";

export function keyStatusLabel(
  status: KeySlotOverviewEntry["slotStatus"],
  locale: DashboardLocale,
) {
  return {
    ACTIVE: { en: "Active", ar: "نشط" },
    INACTIVE: { en: "Inactive", ar: "غير نشط" },
  }[status][locale];
}

export function keyUsageLabel(
  holdingSessionId: string | null,
  locale: DashboardLocale,
) {
  if (holdingSessionId === null) return locale === "ar" ? "فارغ" : "Empty";
  return locale === "ar" ? "قيد الاستخدام" : "In use";
}

export function keyCopy(locale: DashboardLocale) {
  return locale === "ar"
    ? {
        usage: "الاستخدام",
        location: "الموقع",
        allStatuses: "الخانات النشطة وغير النشطة",
        note: "الخانة قيد الاستخدام مرتبطة بجلسة لم تكتمل بعد.",
      }
    : {
        usage: "Usage",
        location: "Location",
        allStatuses: "Active and inactive slots",
        note: "An in-use slot is linked to a session that has not completed.",
      };
}
