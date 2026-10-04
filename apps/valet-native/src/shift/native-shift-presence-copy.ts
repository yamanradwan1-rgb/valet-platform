import type { FoundationLocale } from "../foundation/foundation-locale";

const en = {
  pointInTime:
    "Location is checked for this Shift action only. It is not continuous tracking.",
  discovering: "Checking Shift presence policy…",
  acquiring: "Getting a fresh location…",
  submitting: "Confirming with the server…",
  uncertain:
    "The result is not confirmed. Check the exact operation before trying again.",
  unavailable:
    "Location could not be verified. Retry or check device settings.",
  denied: "The server did not accept this presence check.",
  required:
    "Current policy requires location evidence. Start a new explicit check.",
  pending:
    "Waiting for manager approval. Approval will not start or end your Shift automatically.",
  approved:
    "Manager approval is available. Continue explicitly to confirm your Shift action.",
  rejected: "The manager declined this request.",
  expired: "This request is no longer usable. Start a new explicit attempt.",
  outside: "The server placed this fix outside the attendance area.",
  ambiguous:
    "The server could not determine which side of the boundary this fix is on.",
  inaccurate: "The location accuracy did not meet the current policy.",
  stale: "The location time did not meet the current freshness policy.",
  configuration: "The attendance area configuration needs attention.",
  permission: "Allow foreground location in device settings, then retry.",
  services: "Enable location services in device settings, then retry.",
  manager: "Request manager approval",
  check: "Check request status",
  settings: "Open location settings",
  cancel: "Cancel location check",
  continue: "Continue Shift action",
};
const ar: typeof en = {
  pointInTime:
    "يُفحص الموقع لهذا الإجراء فقط، ولا يتم التتبع المستمر طوال الوردية.",
  discovering: "جارٍ التحقق من سياسة الحضور…",
  acquiring: "جارٍ الحصول على موقع جديد…",
  submitting: "جارٍ التأكيد مع الخادم…",
  uncertain: "لم تتأكد النتيجة. تحقق من العملية نفسها قبل المحاولة مجددًا.",
  unavailable: "تعذر التحقق من الموقع. أعد المحاولة أو تحقق من إعدادات الجهاز.",
  denied: "لم يقبل الخادم فحص الحضور هذا.",
  required: "تتطلب السياسة الحالية دليل الموقع. ابدأ فحصًا جديدًا صراحةً.",
  pending:
    "بانتظار موافقة المدير. لن تبدأ الموافقة الوردية أو تنهيها تلقائيًا.",
  approved: "موافقة المدير متاحة. تابع صراحةً لتأكيد إجراء الوردية.",
  rejected: "رفض المدير هذا الطلب.",
  expired: "لم يعد هذا الطلب صالحًا. ابدأ محاولة جديدة صراحةً.",
  outside: "حدد الخادم هذا الموقع خارج منطقة الحضور.",
  ambiguous: "تعذر على الخادم تحديد جانب حدود المنطقة لهذا الموقع.",
  inaccurate: "دقة الموقع لا تستوفي السياسة الحالية.",
  stale: "وقت الموقع لا يستوفي سياسة حداثة الموقع الحالية.",
  configuration: "تحتاج إعدادات منطقة الحضور إلى المراجعة.",
  permission:
    "اسمح باستخدام الموقع أثناء تشغيل التطبيق في إعدادات الجهاز، ثم أعد المحاولة.",
  services: "فعّل خدمات الموقع في إعدادات الجهاز، ثم أعد المحاولة.",
  manager: "طلب موافقة المدير",
  check: "التحقق من حالة الطلب",
  settings: "فتح إعدادات الموقع",
  cancel: "إلغاء فحص الموقع",
  continue: "متابعة إجراء الوردية",
};
export function getNativePresenceCopy(locale: FoundationLocale) {
  return locale === "ar" ? ar : en;
}
