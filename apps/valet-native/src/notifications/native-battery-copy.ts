import type { FoundationLocale } from "../foundation/foundation-locale";

export const nativeBatteryCopy = {
  en: {
    title: "Battery optimization may delay vehicle requests.",
    detail: "Choose Unrestricted or Don’t optimize for VAYLET Employee in Android settings. Delivery still depends on network and device settings.",
    action: "Open battery settings",
  },
  ar: {
    title: "قد يؤخر تحسين البطارية إشعارات طلب المركبة.",
    detail: "اختر «غير مقيّد» أو «عدم تحسين البطارية» لتطبيق VAYLET Employee في إعدادات Android. يبقى وصول الإشعارات مرتبطاً بالشبكة وإعدادات الجهاز.",
    action: "فتح إعدادات البطارية",
  },
} as const satisfies Record<FoundationLocale, {
  readonly title: string;
  readonly detail: string;
  readonly action: string;
}>;
