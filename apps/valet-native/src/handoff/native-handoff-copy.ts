import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeHandoffCopy {
  abort: string;
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
  failure: string;
  invalidCode: string;
  invalidQr: string;
  manualQr: string;
  override: string;
  overrideReason: string;
  overrideVerified: string;
  overriding: string;
  pendingBody: string;
  pickupCode: string;
  readyBody: string;
  retryAfter: (seconds: number) => string;
  settings: string;
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
    abort: "Abort handoff",
    abortReason: "Abort reason",
    aborting: "Aborting handoff…",
    awaiting: "Awaiting guest proof",
    back: "Back",
    begin: "Begin Guest Handoff",
    beginning: "Beginning handoff…",
    camera: "Scan Dynamic QR",
    check: "Check server state",
    closeCamera: "Close camera",
    conflictBody:
      "Handoff authority changed. Return to current Tasks before continuing.",
    dynamicQr: "Dynamic QR",
    failure:
      "Verification could not be completed. Check the proof and try again.",
    invalidCode: "Enter exactly four digits.",
    invalidQr: "Enter a valid Dynamic QR proof.",
    manualQr: "Dynamic QR manual entry",
    override: "Authorize supervisor override",
    overrideReason: "Supervisor override reason",
    overrideVerified: "Supervisor override authorized",
    overriding: "Authorizing override…",
    pendingBody:
      "Ask the guest for their pickup code or Dynamic QR. Verification does not release the vehicle.",
    pickupCode: "4-digit pickup code",
    readyBody:
      "The vehicle is ready. Begin the secure guest handoff when the guest is present.",
    retryAfter: (seconds) =>
      `Too many attempts. Try again in ${seconds} seconds.`,
    settings: "Open camera settings",
    taskTitle: "Secure handoff",
    unknownBody:
      "The handoff result is unknown. Check server state before another action.",
    unavailableBody: "Current handoff state is unavailable.",
    verifiedBody:
      "Guest proof is verified. The vehicle has not been released or completed.",
    verifiedTitle: "Proof verified",
    verifyCode: "Verify pickup code",
    verifyQr: "Verify Dynamic QR",
    verifying: "Verifying…",
  },
  ar: {
    abort: "إلغاء التسليم",
    abortReason: "سبب إلغاء التسليم",
    aborting: "جارٍ إلغاء التسليم…",
    awaiting: "بانتظار إثبات الضيف",
    back: "رجوع",
    begin: "بدء تسليم الضيف",
    beginning: "جارٍ بدء التسليم…",
    camera: "مسح رمز QR الديناميكي",
    check: "تحقق من حالة الخادم",
    closeCamera: "إغلاق الكاميرا",
    conflictBody: "تغيرت صلاحية التسليم. ارجع إلى المهام الحالية قبل المتابعة.",
    dynamicQr: "رمز QR الديناميكي",
    failure: "تعذر إكمال التحقق. تحقق من الإثبات وحاول مجددًا.",
    invalidCode: "أدخل أربعة أرقام بالضبط.",
    invalidQr: "أدخل إثبات QR ديناميكي صالحًا.",
    manualQr: "إدخال رمز QR الديناميكي يدويًا",
    override: "اعتماد تجاوز المشرف",
    overrideReason: "سبب تجاوز المشرف",
    overrideVerified: "تم اعتماد تجاوز المشرف",
    overriding: "جارٍ اعتماد التجاوز…",
    pendingBody:
      "اطلب من الضيف رمز الاستلام أو رمز QR الديناميكي. التحقق لا يعني تحرير المركبة.",
    pickupCode: "رمز الاستلام من 4 أرقام",
    readyBody: "المركبة جاهزة. ابدأ التسليم الآمن عند حضور الضيف.",
    retryAfter: (seconds) => `محاولات كثيرة. حاول مجددًا بعد ${seconds} ثانية.`,
    settings: "فتح إعدادات الكاميرا",
    taskTitle: "التسليم الآمن",
    unknownBody:
      "نتيجة التسليم غير معروفة. تحقق من حالة الخادم قبل أي إجراء آخر.",
    unavailableBody: "حالة التسليم الحالية غير متاحة.",
    verifiedBody:
      "تم التحقق من إثبات الضيف. لم يتم تحرير المركبة أو إكمال المهمة.",
    verifiedTitle: "تم التحقق من الإثبات",
    verifyCode: "تحقق من رمز الاستلام",
    verifyQr: "تحقق من رمز QR الديناميكي",
    verifying: "جارٍ التحقق…",
  },
};

export function getNativeHandoffCopy(locale: FoundationLocale) {
  return values[locale];
}
