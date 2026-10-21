import type { IncidentOverviewEntry, IncidentType } from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";

const types: Record<IncidentType, Record<DashboardLocale, string>> = {
  VEHICLE_DAMAGE: { en: "Vehicle damage", ar: "ضرر بالمركبة" },
  KEY_MISSING: { en: "Missing key", ar: "مفتاح مفقود" },
  WRONG_KEY: { en: "Wrong key", ar: "مفتاح غير صحيح" },
  KEY_DAMAGED: { en: "Damaged key", ar: "مفتاح تالف" },
  KEY_LOCKED_INSIDE: {
    en: "Key locked inside",
    ar: "المفتاح داخل المركبة المغلقة",
  },
  UNAUTHORIZED_ZONE_EXIT: {
    en: "Unauthorized zone exit",
    ar: "خروج غير مصرح من المنطقة",
  },
  WRONG_VEHICLE_HANDOFF_ATTEMPT: {
    en: "Wrong vehicle handoff attempt",
    ar: "محاولة تسليم مركبة خاطئة",
  },
  PAYMENT_DISPUTE: { en: "Payment dispute", ar: "نزاع دفع" },
  CUSTOMER_COMPLAINT: { en: "Customer complaint", ar: "شكوى عميل" },
  EMPLOYEE_SAFETY: { en: "Employee safety", ar: "سلامة الموظف" },
  SYSTEM_CONNECTION: { en: "System connection", ar: "اتصال النظام" },
  OTHER: { en: "Other", ar: "أخرى" },
};

export function incidentTypeLabel(
  type: string,
  locale: DashboardLocale,
): string {
  return Object.hasOwn(types, type)
    ? types[type as IncidentType][locale]
    : locale === "ar"
      ? "نوع حادث آخر"
      : "Other incident type";
}

export function incidentStatusLabel(
  status: IncidentOverviewEntry["status"],
  locale: DashboardLocale,
) {
  return {
    OPEN: { en: "Open", ar: "مفتوح" },
    INVESTIGATING: { en: "Investigating", ar: "قيد التحقيق" },
    RESOLVED: { en: "Resolved", ar: "تمت المعالجة" },
    CLOSED: { en: "Closed", ar: "مغلق" },
  }[status][locale];
}

export function incidentSeverityLabel(
  severity: IncidentOverviewEntry["severity"],
  locale: DashboardLocale,
) {
  return {
    LOW: { en: "Low", ar: "منخفضة" },
    MEDIUM: { en: "Medium", ar: "متوسطة" },
    HIGH: { en: "High", ar: "عالية" },
    CRITICAL: { en: "Critical", ar: "حرجة" },
  }[severity][locale];
}

export function incidentCopy(locale: DashboardLocale) {
  return locale === "ar"
    ? {
        cohort: "الحوادث المفتوحة وقيد التحقيق",
        location: "الموقع",
        reportedBy: "أبلغ عنه",
        reporterUnavailable: "المبلّغ غير متاح",
        technicalType: "رمز النوع",
        incidentId: "معرّف الحادث",
        resolved: "وقت المعالجة",
      }
    : {
        cohort: "Open and investigating incidents",
        location: "Location",
        reportedBy: "Reported by",
        reporterUnavailable: "Reporter unavailable",
        technicalType: "Type code",
        incidentId: "Incident ID",
        resolved: "Resolved at",
      };
}
