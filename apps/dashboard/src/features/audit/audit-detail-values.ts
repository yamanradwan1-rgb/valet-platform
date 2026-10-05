import type { ManagementAuditEvent } from "@valet/contracts";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { operationsSessionStateLabel } from "../operations/operations-presentation";
import {
  incidentTypeLabel,
  incidentSeverityLabel,
} from "../operations/incidents/incident-presentation";

type Kind = ManagementAuditEvent["details"]["kind"];
const kinds: Record<Kind, readonly [string, string]> = {
  CHECK_IN: ["Check-in", "استلام المركبة"],
  KEY: ["Key", "المفتاح"],
  TASK: ["Task", "المهمة"],
  SHIFT: ["Shift", "الوردية"],
  PRESENCE: ["Shift presence", "التحقق من حضور المناوبة"],
  SESSION: ["Valet session", "جلسة صف المركبة"],
  INCIDENT: ["Incident", "الحادث"],
  FINANCIAL: ["Financial", "المالية"],
  MAP: ["Map", "الخريطة"],
  CONFIGURATION: ["Configuration", "الإعدادات"],
  REPORT: ["Report", "التقرير"],
  STAFF: ["Staff", "فريق العمل"],
  MANAGEMENT: ["Management", "الإدارة"],
  UNKNOWN: ["Unknown", "غير معروف"],
};
export function auditDetailKindLabel(kind: Kind, locale: DashboardLocale) {
  return kinds[kind][locale === "ar" ? 1 : 0];
}

const values: Record<string, readonly [string, string]> = {
  ACTIVE: ["Active", "نشط"],
  INACTIVE: ["Inactive", "غير نشط"],
  ENDED: ["Ended", "منتهية"],
  OPEN: ["Open", "مفتوح"],
  QUEUED: ["Queued", "في قائمة الانتظار"],
  ASSIGNED: ["Assigned", "مسندة"],
  ACCEPTED: ["Accepted", "مقبولة"],
  DECLINED: ["Declined", "مرفوضة"],
  REASSIGNED: ["Reassigned", "أعيد إسنادها"],
  IN_PROGRESS: ["In progress", "قيد التنفيذ"],
  COMPLETED: ["Completed", "مكتملة"],
  CANCELLED: ["Cancelled", "ملغاة"],
  ORG_ADMIN: ["Company Admin", "مسؤول الشركة"],
  LOCATION_MANAGER: ["Location Manager", "مدير الموقع"],
  VALET_SUPERVISOR: ["Valet Supervisor", "مشرف صف المركبات"],
  VALET_EMPLOYEE: ["Valet Employee", "موظف صف المركبات"],
  SET: ["Set", "تعيين"],
  CLEAR: ["Clear", "إزالة"],
  CONFIRMED_PLATE: ["Confirmed plate", "لوحة مؤكدة"],
  TEMPORARY_DESCRIPTOR: ["Temporary description", "وصف مؤقت"],
  DYNAMIC_QR: ["Dynamic QR", "رمز QR متغير"],
  PICKUP_CODE: ["Pickup code", "رمز الاستلام"],
  SUPERVISOR_OVERRIDE: ["Supervisor override", "تجاوز المشرف"],
  displayName: ["Display name", "الاسم المعروض"],
  phoneNormalized: ["Phone number", "رقم الهاتف"],
};
const enumKeys = new Set([
  "fromStatus",
  "toStatus",
  "status",
  "newStatus",
  "previousStatus",
  "role",
  "newRole",
  "previousRole",
  "operation",
  "identityMode",
  "handoffMethod",
  "field",
]);

export function auditDetailValue(
  kind: Kind,
  key: string,
  value: string | number | boolean,
  locale: DashboardLocale,
): string {
  if (typeof value === "boolean")
    return value
      ? locale === "ar"
        ? "نعم"
        : "Yes"
      : locale === "ar"
        ? "لا"
        : "No";
  if (typeof value === "number")
    return new Intl.NumberFormat(locale).format(value);
  if (key === "fromState" || key === "toState")
    return value === "CANCELLED"
      ? values.CANCELLED![locale === "ar" ? 1 : 0]
      : operationsSessionStateLabel(value, locale);
  if (kind === "INCIDENT" && key === "type")
    return incidentTypeLabel(value, locale);
  if (kind === "INCIDENT" && key === "severity")
    return incidentSeverityLabel(
      value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      locale,
    );
  if (enumKeys.has(key) && Object.hasOwn(values, value))
    return values[value]![locale === "ar" ? 1 : 0];
  // Literal safe fields (setting keys, timezone, currency, normalization version) stay literal.
  return value;
}
