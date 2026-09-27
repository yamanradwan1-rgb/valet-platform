import type { ManagementAuditEvent } from "@valet/contracts";
import type { DashboardLocale } from "../../lib/i18n/locale";

const actors = {
  MEMBERSHIP: ["Staff member", "عضو فريق العمل"],
  GUEST: ["Guest", "ضيف"],
  SYSTEM: ["System", "النظام"],
  EXTERNAL_PROVIDER: ["External provider", "مزود خارجي"],
  CONTROLLED_OPERATOR: ["Controlled operator", "مشغّل مخوّل"],
  UNKNOWN: ["Unknown actor", "جهة منفذة غير معروفة"],
} as const;

type EntityType = NonNullable<ManagementAuditEvent["entity"]>["type"];
const entities = {
  VALET_SESSION: ["Valet session", "جلسة صف المركبة"],
  VEHICLE: ["Vehicle", "مركبة"],
  CUSTOMER: ["Visit contact", "جهة اتصال الزيارة"],
  TASK: ["Task", "مهمة"],
  SHIFT: ["Shift", "وردية"],
  INCIDENT: ["Incident", "حادث"],
  PAYMENT: ["Payment", "دفعة"],
  VALIDATION: ["Validation", "إعفاء"],
  CASH_ENTRY: ["Cash entry", "قيد نقدي"],
  PAYMENT_COLLECTION_OPERATION: ["Payment collection", "تحصيل دفع"],
  REFUND: ["Refund", "استرداد"],
  LOCATION: ["Location", "موقع"],
  ORGANIZATION: ["Organization", "مؤسسة"],
  ORGANIZATION_MEMBERSHIP: ["Staff membership", "عضوية موظف"],
  MAP_POINT: ["Map point", "نقطة خريطة"],
  MAP_AREA: ["Map area", "منطقة خريطة"],
} satisfies Record<EntityType, readonly [string, string]>;

export function auditActorLabel(
  event: ManagementAuditEvent,
  locale: DashboardLocale = "en",
): { readonly label: string; readonly id?: string } | null {
  if (event.eventType === "UNKNOWN") return null;
  if (event.actor.type === "MEMBERSHIP") {
    return {
      id: event.actor.membershipId,
      label: actors.MEMBERSHIP[locale === "ar" ? 1 : 0],
    };
  }
  return { label: actors[event.actor.type][locale === "ar" ? 1 : 0] };
}

export function auditEntityLabel(
  event: ManagementAuditEvent,
  locale: DashboardLocale = "en",
): string {
  return event.entity === null
    ? locale === "ar"
      ? "لا يوجد هدف"
      : "No target"
    : entities[event.entity.type][locale === "ar" ? 1 : 0];
}
