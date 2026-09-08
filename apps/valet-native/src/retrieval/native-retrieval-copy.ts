import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeRetrievalCopy {
  readonly assignedBody: string;
  readonly back: string;
  readonly backToTasks: string;
  readonly checkState: string;
  readonly conflictBody: string;
  readonly conflictTitle: string;
  readonly expectedKeySlot: string;
  readonly keySlotVerified: string;
  readonly keyTitle: string;
  readonly keyVerifyBody: string;
  readonly keyVerifyLabel: string;
  readonly loading: string;
  readonly readyBody: string;
  readonly readyTitle: string;
  readonly retrievingBody: string;
  readonly retrievingLabel: string;
  readonly startRetrieval: string;
  readonly startingRetrieval: string;
  readonly taskTitle: string;
  readonly unknownBody: string;
  readonly unknownTitle: string;
  readonly unavailableBody: string;
  readonly unavailableTitle: string;
  readonly vehicleReady: string;
  readonly markingReady: string;
}

const copy: Record<FoundationLocale, NativeRetrievalCopy> = {
  en: {
    assignedBody:
      "Claim and accept this Retrieval Task before starting the retrieval.",
    back: "Back",
    backToTasks: "Back to tasks",
    checkState: "Check server state",
    conflictBody:
      "The Retrieval Task or vehicle state changed. Review current server state before continuing.",
    conflictTitle: "Retrieval work changed",
    expectedKeySlot: "Expected key slot",
    keySlotVerified: "Key slot verified",
    keyTitle: "Key checkout",
    keyVerifyBody:
      "Scan the key slot QR or enter its code to verify it matches the expected slot before starting the retrieval.",
    keyVerifyLabel: "Verify key slot",
    loading: "Loading current Retrieval Task…",
    markingReady: "Marking vehicle ready…",
    readyBody:
      "The vehicle is staged and ready for the guest. Handoff continues in the secure handoff flow.",
    readyTitle: "Vehicle ready",
    retrievingBody:
      "Retrieval started. Bring the vehicle to the pickup area, then mark it ready.",
    retrievingLabel: "Retrieving",
    startRetrieval: "Start Retrieval",
    startingRetrieval: "Starting Retrieval…",
    taskTitle: "Retrieval Task",
    unknownBody:
      "The Retrieval result is unknown. Check server state before taking another action.",
    unknownTitle: "Retrieval result unknown",
    unavailableBody: "Current Retrieval Task state is temporarily unavailable.",
    unavailableTitle: "Unable to load Retrieval Task",
    vehicleReady: "Vehicle Ready",
  },
  ar: {
    assignedBody: "استلم مهمة الاسترجاع هذه واقبلها قبل بدء الاسترجاع.",
    back: "رجوع",
    backToTasks: "العودة إلى المهام",
    checkState: "تحقق من حالة الخادم",
    conflictBody:
      "تغيرت مهمة الاسترجاع أو حالة المركبة. راجع حالة الخادم الحالية قبل المتابعة.",
    conflictTitle: "تغيرت مهمة الاسترجاع",
    expectedKeySlot: "خانة المفتاح المتوقعة",
    keySlotVerified: "تم التحقق من خانة المفتاح",
    keyTitle: "استلام المفتاح",
    keyVerifyBody:
      "امسح رمز خانة المفتاح أو أدخل الرمز للتحقق من مطابقته للخانة المتوقعة قبل بدء الاسترجاع.",
    keyVerifyLabel: "تحقق من خانة المفتاح",
    loading: "جارٍ تحميل مهمة الاسترجاع الحالية…",
    markingReady: "جارٍ تحديد جاهزية المركبة…",
    readyBody:
      "المركبة في منطقة الاستلام وجاهزة للضيف. تتابع عملية التسليم في مسار التسليم الآمن.",
    readyTitle: "المركبة جاهزة",
    retrievingBody:
      "بدأ الاسترجاع. أحضر المركبة إلى منطقة الاستلام ثم حددها جاهزة.",
    retrievingLabel: "جارٍ الاسترجاع",
    startRetrieval: "بدء الاسترجاع",
    startingRetrieval: "جارٍ بدء الاسترجاع…",
    taskTitle: "مهمة الاسترجاع",
    unknownBody:
      "نتيجة الاسترجاع غير معروفة. تحقق من حالة الخادم قبل اتخاذ إجراء آخر.",
    unknownTitle: "نتيجة الاسترجاع غير معروفة",
    unavailableBody: "حالة مهمة الاسترجاع الحالية غير متاحة مؤقتًا.",
    unavailableTitle: "تعذر تحميل مهمة الاسترجاع",
    vehicleReady: "المركبة جاهزة",
  },
};

export function getNativeRetrievalCopy(locale: FoundationLocale) {
  return copy[locale];
}
