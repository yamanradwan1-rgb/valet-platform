import type { DashboardLocale } from "../../../lib/i18n/locale";

const enumLabels: Readonly<Record<string, Readonly<Record<DashboardLocale, string>>>> = {
  PICKUP_CODE: { en: "Pickup code", ar: "رمز الاستلام" },
  DYNAMIC_QR: { en: "Dynamic QR", ar: "رمز QR ديناميكي" },
  EITHER: { en: "Either method", ar: "أي من الطريقتين" },
  CUSTOMER: { en: "Customer", ar: "العميل" },
  VENUE: { en: "Venue", ar: "المنشأة" },
  CASH_ONLY: { en: "Cash only", ar: "نقدًا فقط" },
  DIGITAL_ONLY: { en: "Digital only", ar: "رقمي فقط" },
  CASH_OR_DIGITAL: { en: "Cash or digital", ar: "نقدي أو رقمي" },
  EN: { en: "English", ar: "الإنجليزية" },
  AR: { en: "Arabic", ar: "العربية" },
};

const weekdayLabels: Readonly<Record<string, Readonly<Record<DashboardLocale, string>>>> = {
  MONDAY: { en: "Monday", ar: "الاثنين" },
  TUESDAY: { en: "Tuesday", ar: "الثلاثاء" },
  WEDNESDAY: { en: "Wednesday", ar: "الأربعاء" },
  THURSDAY: { en: "Thursday", ar: "الخميس" },
  FRIDAY: { en: "Friday", ar: "الجمعة" },
  SATURDAY: { en: "Saturday", ar: "السبت" },
  SUNDAY: { en: "Sunday", ar: "الأحد" },
};

export function settingsTableCopy(locale: DashboardLocale) {
  return locale === "ar" ? {
    setting: "الإعداد",
    value: "القيمة",
    actions: "الإجراءات",
    tabsLabel: "نطاق الإعدادات",
    editValue: (label: string) => `تعديل ${label}`,
    operatingHours: "ساعات العمل",
    sevenDaySchedule: "جدول أسبوعي من سبعة أيام",
    slaTarget: "هدف SLA بالثواني",
    slaRange: "من 30 إلى 3600 ثانية",
    open: "مفتوح",
    closed: "مغلق",
    yes: "نعم",
    no: "لا",
    dayStatus: (day: string) => `حالة ${day}`,
    opensAt: (day: string) => `وقت فتح ${day}`,
    closesAt: (day: string) => `وقت إغلاق ${day}`,
  } : {
    setting: "Setting",
    value: "Value",
    actions: "Actions",
    tabsLabel: "Settings scope",
    editValue: (label: string) => `Edit ${label}`,
    operatingHours: "Operating hours",
    sevenDaySchedule: "Seven-day weekly schedule",
    slaTarget: "SLA target seconds",
    slaRange: "30 to 3600 seconds",
    open: "Open",
    closed: "Closed",
    yes: "Yes",
    no: "No",
    dayStatus: (day: string) => `${day} status`,
    opensAt: (day: string) => `${day} opens at`,
    closesAt: (day: string) => `${day} closes at`,
  };
}

export function settingEditorValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

export function settingDisplayValue(value: unknown, locale: DashboardLocale): string {
  const copy = settingsTableCopy(locale);
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? copy.yes : copy.no;
  if (typeof value === "string") return enumLabels[value]?.[locale] ?? value;
  if (typeof value === "number") return String(value);
  return "—";
}

export function settingOptionLabel(value: string, locale: DashboardLocale): string {
  return enumLabels[value]?.[locale] ?? value;
}

export function weekdayLabel(value: string, locale: DashboardLocale): string {
  return weekdayLabels[value]?.[locale] ?? value;
}
