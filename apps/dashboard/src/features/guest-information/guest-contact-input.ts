import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { ContactField, GuestLanguage } from "./guest-information-model";

// Input convenience only. The API and persisted projections remain strict E.164.
export function normalizePublicPhone(value: string | null): string | null {
  const input = value?.trim() ?? "";
  if (!input) return null;
  if (input.length > 240 || !/^[+0-9\s()-]+$/.test(input)) {
    throw new Error("Unsupported phone representation.");
  }
  const digits = input.replace(/[\s()-]/g, "");
  const canonical = /^07[789]\d{7}$/.test(digits)
    ? `+962${digits.slice(1)}`
    : digits;
  if (!/^\+[1-9]\d{6,14}$/.test(canonical)) {
    throw new Error("Unsupported phone representation.");
  }
  return canonical;
}

export function contactFieldError(field: ContactField, locale: GuestLanguage) {
  const copy = {
    phone: [
      "Enter a Jordan mobile number (07…) or an international number beginning with +.",
      "أدخل رقم جوال أردني يبدأ بـ 07 أو رقمًا دوليًا يبدأ بـ +.",
    ],
    supportUrl: [
      "Enter a valid HTTPS support link without credentials.",
      "أدخل رابط دعم HTTPS صالحًا دون بيانات دخول.",
    ],
    hours: [
      "Enter support hours before confirming them (maximum 240 characters).",
      "أدخل ساعات الدعم قبل تأكيدها (240 حرفًا كحد أقصى).",
    ],
    displayName: [
      "Enter a public display name of at most 240 characters.",
      "أدخل اسم عرض عام لا يتجاوز 240 حرفًا.",
    ],
  } as const;
  return copy[field][locale === "ar" ? 1 : 0];
}

export function guestInformationSaveError(
  error: unknown,
  locale: GuestLanguage,
) {
  const kind = error instanceof DashboardApiError ? error.kind : "server";
  const copy: Record<string, readonly [string, string]> = {
    entitlement: ["Dashboard access is unavailable for this company. Review its access status.",
      "الوصول إلى لوحة التحكم غير متاح لهذه الشركة. راجع حالة الوصول."],
    authorization: [
      "You no longer have permission to save these settings.",
      "لم تعد لديك صلاحية حفظ هذه الإعدادات.",
    ],
    auth: [
      "Your session changed. Sign in and review before saving again.",
      "تغيّرت جلستك. سجّل الدخول وراجع الإعدادات قبل إعادة الحفظ.",
    ],
    mfa: [
      "Verify your identity, then review and save again.",
      "تحقّق من هويتك ثم راجع الإعدادات وأعد الحفظ.",
    ],
    conflict: [
      "These settings changed. Reload and review before saving again.",
      "تغيّرت الإعدادات. أعد التحميل والمراجعة قبل الحفظ.",
    ],
    validation: [
      "The server rejected these settings. Review the contact fields and confirmed hours.",
      "رفض الخادم هذه الإعدادات. راجع حقول التواصل وساعات الدعم المؤكدة.",
    ],
    network: [
      "Connection lost. Reload to check whether your settings were saved before retrying.",
      "انقطع الاتصال. أعد التحميل للتحقّق من الحفظ قبل المحاولة مجددًا.",
    ],
    malformed: [
      "The save response could not be verified. Reload before retrying.",
      "تعذّر التحقّق من نتيجة الحفظ. أعد التحميل قبل المحاولة مجددًا.",
    ],
    server: [
      "Saving failed. Reload to check the saved settings before retrying.",
      "تعذّر الحفظ. أعد التحميل للتحقّق من الإعدادات المحفوظة قبل المحاولة مجددًا.",
    ],
  };
  return (copy[kind] ?? copy.server)![locale === "ar" ? 1 : 0];
}
