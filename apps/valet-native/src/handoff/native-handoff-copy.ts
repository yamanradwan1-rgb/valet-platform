import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeHandoffCopy {
  abort: string;
  abortTitle: string;
  abortReason: string;
  aborting: string;
  awaiting: string;
  back: string;
  begin: string;
  beginning: string;
  camera: string;
  check: string;
  closeCamera: string;
  conflictBody: string;
  dynamicQr: string;
  guestHandoff: string;
  failure: string;
  invalidCode: string;
  invalidQr: string;
  manualQr: string;
  manualHint: string;
  override: string;
  overrideReason: string;
  overrideVerified: string;
  overriding: string;
  pendingBody: string;
  pickupCode: string;
  pickupPlaceholder: string;
  qrPlaceholder: string;
  readyForPickup: string;
  reasonRequired: string;
  reportIssue: string;
  readyBody: string;
  retryAfter: (seconds: number) => string;
  settings: string;
  supervisorTitle: string;
  key: string;
  taskTitle: string;
  unknownBody: string;
  unavailableBody: string;
  verifiedBody: string;
  verifiedTitle: string;
  verifyCode: string;
  verifyQr: string;
  verifying: string;
}

const values: Record<FoundationLocale, NativeHandoffCopy> = {
  en: {
    abort: "Abort Handoff",
    abortTitle: "Abort",
    abortReason: "Abort reason",
    aborting: "Aborting handoff…",
    awaiting: "Awaiting guest proof",
    back: "Back",
    begin: "Begin Guest Handoff",
    beginning: "Starting handoff...",
    camera: "Scan QR code",
    check: "Check server state",
    closeCamera: "Close scanner",
    conflictBody:
      "Handoff authority changed. Return to current Tasks before continuing.",
    dynamicQr: "Guest QR code",
    guestHandoff: "Guest Handoff",
    failure:
      "Verification could not be completed. Check the proof and try again.",
    invalidCode: "Enter exactly four digits.",
    invalidQr: "Enter a valid Dynamic QR proof.",
    manualQr: "Dynamic QR manual entry",
    manualHint: "You can enter the code manually at any time below.",
    override: "Override Verification",
    overrideReason: "Reason (required)",
    overrideVerified: "Supervisor override authorized",
    overriding: "Authorizing override…",
    pendingBody:
      "Ask the guest for their pickup code or Dynamic QR. Verification does not release the vehicle.",
    pickupCode: "Pickup code",
    pickupPlaceholder: "0000",
    qrPlaceholder: "vhq1.…",
    readyForPickup: "Ready for pickup",
    reasonRequired: "Reason (required)",
    reportIssue: "Report Issue",
    readyBody:
      "The vehicle is ready. Begin the secure guest handoff when the guest is present.",
    retryAfter: (seconds) =>
      `Too many attempts. Try again in ${seconds} seconds.`,
    settings: "Open camera settings",
    supervisorTitle: "Supervisor override",
    key: "Key",
    taskTitle: "Vehicle Ready",
    unknownBody:
      "The handoff result is unknown. Check server state before another action.",
    unavailableBody: "Current handoff state is unavailable.",
    verifiedBody:
      "Guest proof is verified. The vehicle has not been released or completed.",
    verifiedTitle: "Identity verified",
    verifyCode: "Verify Code",
    verifyQr: "Verify QR",
    verifying: "Verifying…",
  },
  ar: {
    abort: "إلغاء التسليم",
    abortTitle: "إلغاء",
    abortReason: "سبب إلغاء التسليم",
    aborting: "جارٍ إلغاء التسليم…",
    awaiting: "بانتظار إثبات الضيف",
    back: "رجوع",
    begin: "بدء تسليم الضيف",
    beginning: "جارٍ بدء التسليم…",
    camera: "مسح رمز QR",
    check: "تحقق من حالة الخادم",
    closeCamera: "إغلاق الماسح",
    conflictBody: "تغيرت صلاحية التسليم. ارجع إلى المهام الحالية قبل المتابعة.",
    dynamicQr: "رمز QR للضيف",
    guestHandoff: "تسليم الضيف",
    failure: "تعذر إكمال التحقق. تحقق من الإثبات وحاول مجددًا.",
    invalidCode: "أدخل أربعة أرقام بالضبط.",
    invalidQr: "أدخل إثبات QR ديناميكي صالحًا.",
    manualQr: "إدخال رمز QR الديناميكي يدويًا",
    manualHint: "يمكنك إدخال الرمز يدويًا في أي وقت أدناه.",
    override: "تجاوز التحقق",
    overrideReason: "السبب (مطلوب)",
    overrideVerified: "تم اعتماد تجاوز المشرف",
    overriding: "جارٍ اعتماد التجاوز…",
    pendingBody:
      "اطلب من الضيف رمز الاستلام أو رمز QR الديناميكي. التحقق لا يعني تحرير المركبة.",
    pickupCode: "رمز الاستلام",
    pickupPlaceholder: "0000",
    qrPlaceholder: "vhq1.…",
    readyForPickup: "جاهز للاستلام",
    reasonRequired: "السبب (مطلوب)",
    reportIssue: "الإبلاغ عن مشكلة",
    readyBody: "المركبة جاهزة. ابدأ التسليم الآمن عند حضور الضيف.",
    retryAfter: (seconds) => `محاولات كثيرة. حاول مجددًا بعد ${seconds} ثانية.`,
    settings: "فتح إعدادات الكاميرا",
    supervisorTitle: "تجاوز المشرف",
    key: "المفتاح",
    taskTitle: "المركبة جاهزة",
    unknownBody:
      "نتيجة التسليم غير معروفة. تحقق من حالة الخادم قبل أي إجراء آخر.",
    unavailableBody: "حالة التسليم الحالية غير متاحة.",
    verifiedBody:
      "تم التحقق من إثبات الضيف. لم يتم تحرير المركبة أو إكمال المهمة.",
    verifiedTitle: "تم التحقق من الهوية",
    verifyCode: "تحقق من الرمز",
    verifyQr: "تحقق من QR",
    verifying: "جارٍ التحقق…",
  },
};

export function getNativeHandoffCopy(locale: FoundationLocale) {
  return values[locale];
}
