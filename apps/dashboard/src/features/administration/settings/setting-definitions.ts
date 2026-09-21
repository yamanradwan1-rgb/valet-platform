import type { ManagementSettingKey } from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";

export type SettingEditorKind = "boolean" | "integer" | "money" | "select";
export interface SettingDefinition {
  readonly key: ManagementSettingKey;
  readonly kind: SettingEditorKind;
  readonly labels: Readonly<Record<DashboardLocale, string>>;
  readonly options?: readonly string[];
}

export const settingDefinitions: readonly SettingDefinition[] = [
  { key: "checkInPhotosRequired", kind: "boolean", labels: { en: "Check-in photos required", ar: "صور الدخول مطلوبة" } },
  { key: "handoffStandardMethodPolicy", kind: "select", labels: { en: "Handoff method", ar: "طريقة التسليم" }, options: ["PICKUP_CODE", "DYNAMIC_QR", "EITHER"] },
  { key: "trackingEnabled", kind: "boolean", labels: { en: "Tracking enabled", ar: "تفعيل التتبع" } },
  { key: "rawGpsRetentionDays", kind: "integer", labels: { en: "Raw GPS retention days", ar: "أيام الاحتفاظ ببيانات GPS" } },
  { key: "valetServiceFee", kind: "money", labels: { en: "Valet service fee", ar: "رسوم خدمة صف السيارات" } },
  { key: "paymentServicePayer", kind: "select", labels: { en: "Service fee payer", ar: "دافع رسوم الخدمة" }, options: ["CUSTOMER", "VENUE"] },
  { key: "paymentMethodsPolicy", kind: "select", labels: { en: "Payment methods", ar: "طرق الدفع" }, options: ["CASH_ONLY", "DIGITAL_ONLY", "CASH_OR_DIGITAL"] },
  { key: "tipsEnabled", kind: "boolean", labels: { en: "Tips enabled", ar: "تفعيل الإكراميات" } },
  { key: "validationEnabled", kind: "boolean", labels: { en: "Validation enabled", ar: "تفعيل المصادقة" } },
  { key: "releaseRequiresPayment", kind: "boolean", labels: { en: "Release requires payment", ar: "الدفع مطلوب قبل التسليم" } },
  { key: "languageDefault", kind: "select", labels: { en: "Default language", ar: "اللغة الافتراضية" }, options: ["EN", "AR"] },
  { key: "ocrAssistEnabled", kind: "boolean", labels: { en: "OCR assist enabled", ar: "تفعيل مساعدة OCR" } },
  { key: "parkingSpotRequired", kind: "boolean", labels: { en: "Parking spot required", ar: "موقف السيارة مطلوب" } },
  { key: "employeeRetrievalRequestedNotificationEnabled", kind: "boolean", labels: { en: "Employee retrieval notification", ar: "إشعار الموظف بطلب الاسترجاع" } },
  { key: "guestVehicleReadyNotificationEnabled", kind: "boolean", labels: { en: "Guest vehicle-ready notification", ar: "إشعار الضيف بجاهزية المركبة" } },
] as const;

export const legacyLocationKeys = new Set<ManagementSettingKey>([
  "checkInPhotosRequired", "handoffStandardMethodPolicy", "trackingEnabled",
  "rawGpsRetentionDays", "valetServiceFee", "paymentServicePayer",
  "paymentMethodsPolicy", "tipsEnabled", "validationEnabled", "releaseRequiresPayment",
]);

export function settingValueText(value: unknown): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "configured";
}
