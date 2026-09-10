import type { FoundationLocale } from "../foundation/foundation-locale";
import type { NativeGuestAccessError } from "./native-guest-access-types";

const en = {
  active: "Active",
  activeNoLink:
    "Guest access is active. The previous link cannot be shown again. Reissue to get a new shareable link.",
  back: "Back",
  cancel: "Cancel",
  copied: "Guest link copied",
  copyFailed: "Copying failed. Try again.",
  copyLink: "Copy Guest Link",
  create: "Create Guest Access",
  creating: "Creating Guest Access...",
  createNew: "Create New Access",
  errors: {
    CONFIG_INVALID:
      "Guest access is unavailable because the Customer app address is not configured correctly.",
    GENERATED_CREDENTIAL_INVALID: "Generated guest access was invalid.",
    INTENT_CONFLICT:
      "Guest access changed elsewhere. Showing the current state.",
    LOAD_FAILED: "The guest access state could not be loaded.",
    OFFLINE: "You appear to be offline.",
    OUTCOME_UNKNOWN:
      "The outcome is unknown. Showing the current server state.",
    REVOKE_FAILED: "Revocation failed.",
    UPDATE_FAILED: "Guest access could not be updated.",
  } satisfies Record<NativeGuestAccessError, string>,
  entryHint: "Share a secure guest link for this vehicle",
  expired: "Guest access expired",
  expires: "Expires",
  loading: "Loading session context…",
  noNetwork: "No network connection. Reconnect to refresh and continue.",
  notCreated: "Not created",
  qrAlt: "QR code containing the guest access link",
  ready: "Guest access ready",
  reissue: "Reissue Access",
  reissueBody:
    "The current guest access stops working immediately and is replaced by a new link.",
  reissueTitle: "Reissue guest access?",
  retry: "Retry",
  revoke: "Revoke Access",
  revokeBody: "The customer's current access stops working immediately.",
  revoked: "Access revoked",
  revokedHint: "Create new access to generate a fresh guest link.",
  revokeTitle: "Revoke guest access?",
  shareHint: "Let the guest scan this QR or share the copied link.",
  title: "Guest Access",
} as const;

const ar = {
  active: "نشط",
  activeNoLink:
    "وصول الضيف نشط. لا يمكن عرض الرابط السابق مرة أخرى. أعد الإصدار للحصول على رابط جديد للمشاركة.",
  back: "رجوع",
  cancel: "إلغاء",
  copied: "تم نسخ رابط الضيف",
  copyFailed: "فشل النسخ. حاول مرة أخرى.",
  copyLink: "نسخ رابط الضيف",
  create: "إنشاء وصول الضيف",
  creating: "جارٍ إنشاء وصول الضيف...",
  createNew: "إنشاء وصول جديد",
  errors: {
    CONFIG_INVALID:
      "وصول الضيف غير متاح لأن عنوان تطبيق العميل غير مهيأ بشكل صحيح.",
    GENERATED_CREDENTIAL_INVALID:
      "بيانات وصول الضيف التي تم إنشاؤها غير صالحة.",
    INTENT_CONFLICT: "تغيّر وصول الضيف من مكان آخر. يتم عرض الحالة الحالية.",
    LOAD_FAILED: "تعذّر تحميل حالة وصول الضيف.",
    OFFLINE: "يبدو أنك غير متصل بالإنترنت.",
    OUTCOME_UNKNOWN: "النتيجة غير معروفة. يتم عرض حالة الخادم الحالية.",
    REVOKE_FAILED: "فشل إلغاء الوصول.",
    UPDATE_FAILED: "تعذّر تحديث وصول الضيف.",
  },
  entryHint: "شارك رابط ضيف آمن لهذه المركبة",
  expired: "انتهت صلاحية وصول الضيف",
  expires: "ينتهي في",
  loading: "جارٍ تحميل سياق الجلسة…",
  noNetwork: "لا يوجد اتصال بالشبكة. أعد الاتصال للتحديث والمتابعة.",
  notCreated: "لم يتم إنشاؤه",
  qrAlt: "رمز QR يحتوي رابط وصول الضيف",
  ready: "وصول الضيف جاهز",
  reissue: "إعادة إصدار الوصول",
  reissueBody: "يتوقف وصول الضيف الحالي فورًا ويُستبدل برابط جديد.",
  reissueTitle: "إعادة إصدار وصول الضيف؟",
  retry: "إعادة المحاولة",
  revoke: "إلغاء الوصول",
  revokeBody: "يتوقف وصول العميل الحالي فورًا.",
  revoked: "تم إلغاء الوصول",
  revokedHint: "أنشئ وصولًا جديدًا لإنشاء رابط ضيف جديد.",
  revokeTitle: "إلغاء وصول الضيف؟",
  shareHint: "دع الضيف يمسح رمز QR هذا أو شارك الرابط المنسوخ.",
  title: "وصول الضيف",
} as const;

export function getNativeGuestAccessCopy(locale: FoundationLocale) {
  return locale === "ar" ? ar : en;
}
