import {
  settingDefinitions,
  legacyLocationKeys,
} from "@dashboard/features/administration/settings/setting-definitions";
import {
  contextHelpFor,
  type ContextHelpKey,
} from "@dashboard/features/help/context-help-registry";
import type { DashboardLocale } from "@dashboard/lib/i18n/locale";

export type Locale = DashboardLocale;
export type Role = "COMPANY_ADMIN" | "LOCATION_MANAGER" | "DENIED";
export type Section =
  | "operations"
  | "payments"
  | "hours"
  | "tracking"
  | "notifications"
  | "presence"
  | "zones"
  | "whatsapp";
export type Scope = "company" | "location";
export type Scalar = string | number | boolean | null;
export interface Field {
  key: string;
  kind: "boolean" | "integer" | "money" | "select";
  labels: Record<Locale, string>;
  section: Section;
  help?: ContextHelpKey;
  options?: readonly string[];
  min?: number;
  max?: number;
}
export const sectionCopy: Record<
  Section,
  { en: string; ar: string; hint: [string, string]; help: ContextHelpKey }
> = {
  operations: {
    en: "Vehicle operations",
    ar: "عمليات المركبات",
    hint: [
      "From arrival to a secure handoff.",
      "من وصول المركبة إلى تسليمها بأمان.",
    ],
    help: "policies.company",
  },
  payments: {
    en: "Payments & validation",
    ar: "الدفع والمصادقة",
    hint: [
      "Set the payment rules your team works with.",
      "اضبط قواعد الدفع التي يعمل بها فريقك.",
    ],
    help: "policies.company",
  },
  hours: {
    en: "Operating hours & SLA",
    ar: "ساعات العمل وSLA",
    hint: [
      "A clear schedule. A location-specific retrieval target.",
      "جدول واضح وهدف استرجاع خاص بالموقع.",
    ],
    help: "setting.operatingHours",
  },
  tracking: {
    en: "Task tracking",
    ar: "تتبع المهام",
    hint: [
      "Task-scoped location data, with a deliberate retention policy.",
      "بيانات موقع مرتبطة بالمهام، مع سياسة احتفاظ واضحة.",
    ],
    help: "setting.trackingEnabled",
  },
  notifications: {
    en: "Language & notifications",
    ar: "اللغة والإشعارات",
    hint: [
      "Choose the default language and supported notifications.",
      "اختر اللغة الافتراضية والإشعارات المدعومة.",
    ],
    help: "setting.languageDefault",
  },
  presence: {
    en: "Shift Presence",
    ar: "التحقق من حضور المناوبة",
    hint: [
      "Configure Start and End independently of vehicle tracking.",
      "اضبط بداية المناوبة ونهايتها بشكل مستقل عن تتبع المركبات.",
    ],
    help: "policies.presence",
  },
  zones: {
    en: "Attendance zones",
    ar: "مناطق الحضور",
    hint: [
      "Define the places used for Shift Presence checks.",
      "حدّد الأماكن المستخدمة للتحقق من حضور المناوبة.",
    ],
    help: "presence.zones",
  },
  whatsapp: {
    en: "WhatsApp Guest Access",
    ar: "رابط الضيف عبر واتساب",
    hint: [
      "Guest-link policy. Sending activation remains separate.",
      "سياسة رابط الضيف. تفعيل الإرسال إجراء مستقل.",
    ],
    help: "policies.company",
  },
};
const groups: Record<string, Section> = {
  checkInPhotosRequired: "operations",
  handoffStandardMethodPolicy: "operations",
  ocrAssistEnabled: "operations",
  parkingSpotRequired: "operations",
  trackingEnabled: "tracking",
  rawGpsRetentionDays: "tracking",
  languageDefault: "notifications",
  employeeRetrievalRequestedNotificationEnabled: "notifications",
  guestVehicleReadyNotificationEnabled: "notifications",
};
export const fields: Field[] = settingDefinitions.map((field) => ({
  ...field,
  section: groups[field.key] ?? "payments",
  help: `setting.${field.key}` as ContextHelpKey,
  ...(field.kind === "integer" ? { min: 1, max: 2147483647 } : {}),
}));
const modes = ["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"];
fields.push(
  {
    key: "shiftStartPresenceMode",
    kind: "select",
    section: "presence",
    labels: {
      en: "Start Shift Presence Mode",
      ar: "التحقق من الحضور عند بدء المناوبة",
    },
    options: modes,
    help: "presence.shiftStartPresenceMode",
  },
  {
    key: "shiftEndPresenceMode",
    kind: "select",
    section: "presence",
    labels: {
      en: "End Shift Presence Mode",
      ar: "التحقق من الحضور عند إنهاء المناوبة",
    },
    options: modes,
    help: "presence.shiftEndPresenceMode",
  },
  {
    key: "shiftPresenceMaxAccuracyMeters",
    kind: "integer",
    section: "presence",
    labels: {
      en: "Maximum accepted GPS accuracy",
      ar: "الحد الأقصى المقبول لدقة GPS",
    },
    min: 1,
    max: 200,
    help: "presence.shiftPresenceMaxAccuracyMeters",
  },
  {
    key: "shiftPresenceMaxFixAgeSeconds",
    kind: "integer",
    section: "presence",
    labels: { en: "Maximum GPS fix age", ar: "الحد الأقصى لعمر قراءة GPS" },
    min: 1,
    max: 120,
    help: "presence.shiftPresenceMaxFixAgeSeconds",
  },
  {
    key: "slaTargetSeconds",
    kind: "integer",
    section: "hours",
    labels: { en: "SLA target seconds", ar: "هدف SLA بالثواني" },
    min: 30,
    max: 3600,
    help: "setting.slaTargetSeconds",
  },
  {
    key: "waEnabled",
    kind: "boolean",
    section: "whatsapp",
    labels: {
      en: "Company / Location sending policy",
      ar: "إعداد إرسال الشركة/الموقع",
    },
  },
  {
    key: "waLanguage",
    kind: "select",
    section: "whatsapp",
    labels: { en: "Message language", ar: "لغة الرسالة" },
    options: ["ar", "en"],
  },
  {
    key: "waTemplate",
    kind: "select",
    section: "whatsapp",
    labels: { en: "Approved template version", ar: "نسخة القالب المعتمدة" },
    options: [""],
  },
  {
    key: "waBinding",
    kind: "select",
    section: "whatsapp",
    labels: {
      en: "Company WhatsApp sending number",
      ar: "رقم واتساب الخاص بالشركة",
    },
    options: [""],
  },
);

export function availableSections(role: Role, scope: Scope): Section[] {
  if (role === "DENIED") return [];
  if (role === "LOCATION_MANAGER")
    return ["operations", "payments", "tracking", "presence", "zones"];
  return scope === "company"
    ? [
        "operations",
        "payments",
        "hours",
        "tracking",
        "notifications",
        "presence",
        "whatsapp",
      ]
    : [
        "operations",
        "payments",
        "hours",
        "tracking",
        "notifications",
        "presence",
        "zones",
        "whatsapp",
      ];
}
export function visibleFields(section: Section, role: Role, scope: Scope) {
  return fields
    .filter((field) => field.section === section)
    .filter((field) => scope === "location" || field.key !== "slaTargetSeconds")
    .filter(
      (field) =>
        role !== "LOCATION_MANAGER" ||
        field.section === "presence" ||
        legacyLocationKeys.has(field.key as never),
    );
}
export function fieldDescription(field: Field, locale: Locale) {
  if (field.help)
    return contextHelpFor(field.help, locale).body.split(/\. |。/)[0] + ".";
  return locale === "ar"
    ? "حفظ السياسة لا يفعّل الإرسال الحقيقي."
    : "Saving policy does not activate live sending.";
}
