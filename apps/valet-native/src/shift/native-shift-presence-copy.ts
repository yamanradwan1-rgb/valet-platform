import type { FoundationLocale } from "../foundation/foundation-locale";

const en = {
  requestUnusable:
    "This request is no longer usable. Verify the current Shift before a new attempt.",
  checkPending:
    "The previous request is still pending. Check again before trying a new request.",
  approverRevoked:
    "The manager approval is no longer authorized. A new explicit attempt is required.",
  checkedDenied:
    "The previous request was rejected. Your Shift was not ended by that request.",
  checkedExpired:
    "This request is no longer usable. The same active Shift was verified; you can start a new explicit attempt.",
  contextRequired:
    "Current Shift authority could not be verified. Check again before a new attempt.",
  checkFeedback: {
    checking: "Checking the exact previous request…",
    committed: "The previous request was confirmed.",
    unresolved:
      "The server could not confirm the result. Check again; do not submit another request.",
    "no-attempt":
      "No recoverable request is available. The Shift result remains unconfirmed.",
    blocked: "Another operation is already running. Wait for it to finish.",
    "rate-limited": "Please wait before checking again.",
    offline: "Cannot check while offline. Reconnect and check again.",
    error: "The server could not confirm the result. Check again.",
  },

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
  requestUnusable:
    "لم يعد هذا الطلب صالحًا. تحقق من الوردية الحالية قبل محاولة جديدة.",
  checkPending:
    "لا يزال الطلب السابق قيد الانتظار. تحقق مجددًا قبل إرسال طلب جديد.",
  approverRevoked: "لم تعد موافقة المدير مخولة. يلزم بدء محاولة جديدة صراحةً.",
  checkedDenied: "رُفض الطلب السابق. لم يُنهِ ذلك الطلب ورديتك.",
  checkedExpired:
    "لم يعد هذا الطلب صالحًا. تم التحقق من الوردية النشطة نفسها؛ يمكنك بدء محاولة جديدة صراحةً.",
  contextRequired:
    "تعذر التحقق من صلاحية إجراء الوردية الحالية. تحقق مجددًا قبل محاولة جديدة.",
  checkFeedback: {
    checking: "جارٍ التحقق من الطلب السابق نفسه…",
    committed: "تم تأكيد الطلب السابق.",
    unresolved:
      "تعذر على الخادم تأكيد النتيجة. تحقق مجددًا ولا ترسل طلبًا آخر.",
    "no-attempt":
      "لا يتوفر طلب قابل للاسترداد. لا تزال نتيجة الوردية غير مؤكدة.",
    blocked: "هناك عملية أخرى قيد التنفيذ. انتظر حتى تنتهي.",
    "rate-limited": "يرجى الانتظار قبل التحقق مجددًا.",
    offline: "لا يمكن التحقق دون اتصال. أعد الاتصال ثم تحقق مجددًا.",
    error: "تعذر على الخادم تأكيد النتيجة. تحقق مجددًا.",
  },

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
