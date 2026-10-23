/**
 * Prototype-only catalog transcribed from production setting-definitions.ts,
 * management-settings.ts, help-setting-manifest.ts, and the LM legacy key set.
 * This module has no API, persistence, authentication, or side effects.
 */
export type FixtureLocale = "en" | "ar";
export type FixtureRole = "COMPANY_ADMIN" | "LOCATION_MANAGER" | "DENIED";
export type FixtureSectionId =
  | "overview"
  | "company"
  | "location"
  | "presence"
  | "services";
export type FixtureValue = string | number | boolean | null;
export type FixtureEditorKind = "boolean" | "integer" | "money" | "select";

export interface FixtureSettingDefinition {
  readonly key: string;
  readonly label: Readonly<Record<FixtureLocale, string>>;
  readonly kind: FixtureEditorKind;
  readonly options?: readonly string[];
  readonly locationManager: boolean;
  readonly helpKey: string;
}

export const ordinarySettings: readonly FixtureSettingDefinition[] = [
  { key: "checkInPhotosRequired", label: { en: "Check-in photos required", ar: "صور الدخول مطلوبة" }, kind: "boolean", locationManager: true, helpKey: "setting.checkInPhotosRequired" },
  { key: "handoffStandardMethodPolicy", label: { en: "Handoff method", ar: "طريقة التسليم" }, kind: "select", options: ["PICKUP_CODE", "DYNAMIC_QR", "EITHER"], locationManager: true, helpKey: "setting.handoffStandardMethodPolicy" },
  { key: "trackingEnabled", label: { en: "Tracking enabled", ar: "تفعيل التتبع" }, kind: "boolean", locationManager: true, helpKey: "setting.trackingEnabled" },
  { key: "rawGpsRetentionDays", label: { en: "Raw GPS retention days", ar: "أيام الاحتفاظ ببيانات GPS" }, kind: "integer", locationManager: true, helpKey: "setting.rawGpsRetentionDays" },
  { key: "valetServiceFee", label: { en: "Valet service fee", ar: "رسوم خدمة صف السيارات" }, kind: "money", locationManager: true, helpKey: "setting.valetServiceFee" },
  { key: "paymentServicePayer", label: { en: "Service fee payer", ar: "دافع رسوم الخدمة" }, kind: "select", options: ["CUSTOMER", "VENUE"], locationManager: true, helpKey: "setting.paymentServicePayer" },
  { key: "paymentMethodsPolicy", label: { en: "Payment methods", ar: "طرق الدفع" }, kind: "select", options: ["CASH_ONLY", "DIGITAL_ONLY", "CASH_OR_DIGITAL"], locationManager: true, helpKey: "setting.paymentMethodsPolicy" },
  { key: "tipsEnabled", label: { en: "Tips enabled", ar: "تفعيل الإكراميات" }, kind: "boolean", locationManager: true, helpKey: "setting.tipsEnabled" },
  { key: "validationEnabled", label: { en: "Validation enabled", ar: "تفعيل المصادقة" }, kind: "boolean", locationManager: true, helpKey: "setting.validationEnabled" },
  { key: "releaseRequiresPayment", label: { en: "Release requires payment", ar: "الدفع مطلوب قبل التسليم" }, kind: "boolean", locationManager: true, helpKey: "setting.releaseRequiresPayment" },
  { key: "languageDefault", label: { en: "Default language", ar: "اللغة الافتراضية" }, kind: "select", options: ["EN", "AR"], locationManager: false, helpKey: "setting.languageDefault" },
  { key: "ocrAssistEnabled", label: { en: "OCR assist enabled", ar: "تفعيل مساعدة OCR" }, kind: "boolean", locationManager: false, helpKey: "setting.ocrAssistEnabled" },
  { key: "parkingSpotRequired", label: { en: "Parking spot required", ar: "موقف السيارة مطلوب" }, kind: "boolean", locationManager: false, helpKey: "setting.parkingSpotRequired" },
  { key: "employeeRetrievalRequestedNotificationEnabled", label: { en: "Employee retrieval notification", ar: "إشعار الموظف بطلب الاسترجاع" }, kind: "boolean", locationManager: false, helpKey: "setting.employeeRetrievalRequestedNotificationEnabled" },
  { key: "guestVehicleReadyNotificationEnabled", label: { en: "Guest vehicle-ready notification", ar: "إشعار الضيف بجاهزية المركبة" }, kind: "boolean", locationManager: false, helpKey: "setting.guestVehicleReadyNotificationEnabled" },
] as const;

export const specialSettings = [
  {
    key: "operatingHours", label: { en: "Operating hours", ar: "ساعات العمل" },
    helpKey: "setting.operatingHours", scope: "COMPANY_AND_CA_LOCATION",
    note: "Seven ordered weekdays; informational and nullable. Not on Location Manager legacy panel.",
  },
  {
    key: "slaTargetSeconds", label: { en: "SLA target seconds", ar: "هدف SLA بالثواني" },
    helpKey: "setting.slaTargetSeconds", scope: "CA_LOCATION_ONLY",
    note: "Nullable integer 30–3600. No Company default or inheritance.",
  },
] as const;

export const presenceSettings = [
  { key: "shiftStartPresenceMode", label: { en: "Shift start mode", ar: "سياسة بدء الوردية" }, helpKey: "presence.shiftStartPresenceMode", options: ["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"] },
  { key: "shiftEndPresenceMode", label: { en: "Shift end mode", ar: "سياسة إنهاء الوردية" }, helpKey: "presence.shiftEndPresenceMode", options: ["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"] },
  { key: "shiftPresenceMaxAccuracyMeters", label: { en: "Maximum GPS accuracy (m)", ar: "أقصى دقة GPS (متر)" }, helpKey: "presence.shiftPresenceMaxAccuracyMeters", min: 1, max: 200 },
  { key: "shiftPresenceMaxFixAgeSeconds", label: { en: "Maximum location age (s)", ar: "أقصى عمر للموقع (ثانية)" }, helpKey: "presence.shiftPresenceMaxFixAgeSeconds", min: 1, max: 120 },
] as const;

export const sections = [
  { id: "overview", label: { en: "Overview", ar: "نظرة عامة" }, roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"], optional: true },
  { id: "company", label: { en: "Company Defaults", ar: "إعدادات الشركة الافتراضية" }, roles: ["COMPANY_ADMIN"], optional: false, helpKey: "policies.company" },
  { id: "location", label: { en: "Location Overrides", ar: "تخصيص إعدادات الموقع" }, roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"], optional: false, helpKey: "policies.location" },
  { id: "presence", label: { en: "Shift Presence", ar: "حضور الورديات" }, roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"], optional: false, helpKey: "policies.presence" },
  { id: "services", label: { en: "Service Status", ar: "حالة الخدمات" }, roles: ["COMPANY_ADMIN"], optional: false, helpKey: "policies.services", readOnly: true },
] as const;

export const serviceStatusKeys = ["PLATE_OCR", "STAFF_PUSH", "DIGITAL_PAYMENT"] as const;

export function allowedSections(role: FixtureRole, hasLocation: boolean) {
  if (role === "DENIED") return [];
  return sections.filter((section) => (
    (section.roles as readonly string[]).includes(role) &&
    (section.id !== "presence" || role === "COMPANY_ADMIN" || hasLocation)
  ));
}
