import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeRetrievalCopy {
  readonly assignedBody: string;
  readonly back: string;
  readonly backToTasks: string;
  readonly checkState: string;
  readonly conflictBody: string;
  readonly conflictTitle: string;
  readonly expectedKeySlot: string;
  readonly elapsed: string;
  readonly enterKeySlotCode: string;
  readonly key: string;
  readonly keySlotVerified: string;
  readonly keyTitle: string;
  readonly keyVerifyBody: string;
  readonly keyVerifyLabel: string;
  readonly loading: string;
  readonly location: string;
  readonly readyBody: string;
  readonly readyTitle: string;
  readonly retrievingBody: string;
  readonly retrievingLabel: string;
  readonly retrievalBadge: string;
  readonly startRetrieval: string;
  readonly startingRetrieval: string;
  readonly taskTitle: string;
  readonly vehicle: string;
  readonly unknownBody: string;
  readonly unknownTitle: string;
  readonly unavailableBody: string;
  readonly unavailableTitle: string;
  readonly vehicleReady: string;
  readonly markingReady: string;
  readonly reportIssue: string;
  readonly zone: string;
  readonly spot: string;
  readonly scanQr: string;
  readonly closeScanner: string;
  readonly manualHint: string;
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
    elapsed: "Elapsed",
    enterKeySlotCode: "Enter Key Slot Code",
    key: "Key",
    keySlotVerified: "Key slot verified",
    keyTitle: "Key Checkout",
    keyVerifyBody: "Enter Key Slot Code",
    keyVerifyLabel: "Verify Key Slot",
    loading: "Loading retrieval session details...",
    location: "Location",
    markingReady: "Marking Ready...",
    readyBody:
      "The vehicle is staged and ready for the guest. Handoff continues in the secure handoff flow.",
    readyTitle: "Vehicle Ready",
    retrievingBody:
      "Retrieval started. Bring the vehicle to the pickup area, then mark it ready.",
    retrievingLabel: "Retrieving",
    retrievalBadge: "Retrieval",
    startRetrieval: "Start Retrieval",
    startingRetrieval: "Starting Retrieval…",
    taskTitle: "Retrieval Operation",
    unknownBody:
      "The Retrieval result is unknown. Check server state before taking another action.",
    unknownTitle: "Retrieval result unknown",
    unavailableBody: "Current Retrieval Task state is temporarily unavailable.",
    unavailableTitle: "Unable to load Retrieval Task",
    vehicleReady: "Vehicle Ready",
    vehicle: "Vehicle",
    reportIssue: "Report Issue",
    zone: "Zone",
    spot: "Spot",
    scanQr: "Scan QR code",
    closeScanner: "Close scanner",
    manualHint: "You can enter the code manually at any time below.",
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
    elapsed: "الوقت المنقضي",
    enterKeySlotCode: "أدخل رمز خانة المفتاح",
    key: "المفتاح",
    keySlotVerified: "تم التحقق من خانة المفتاح",
    keyTitle: "استلام المفتاح",
    keyVerifyBody: "أدخل رمز خانة المفتاح",
    keyVerifyLabel: "تحقق من خانة المفتاح",
    loading: "جارٍ تحميل تفاصيل جلسة الاسترجاع...",
    location: "الموقع",
    markingReady: "جارٍ تأكيد الجاهزية...",
    readyBody:
      "المركبة في منطقة الاستلام وجاهزة للضيف. تتابع عملية التسليم في مسار التسليم الآمن.",
    readyTitle: "المركبة جاهزة",
    retrievingBody:
      "بدأ الاسترجاع. أحضر المركبة إلى منطقة الاستلام ثم حددها جاهزة.",
    retrievingLabel: "جارٍ الاسترجاع",
    retrievalBadge: "الاسترجاع",
    startRetrieval: "بدء الاسترجاع",
    startingRetrieval: "جارٍ بدء الاسترجاع…",
    taskTitle: "عملية الاسترجاع",
    unknownBody:
      "نتيجة الاسترجاع غير معروفة. تحقق من حالة الخادم قبل اتخاذ إجراء آخر.",
    unknownTitle: "نتيجة الاسترجاع غير معروفة",
    unavailableBody: "حالة مهمة الاسترجاع الحالية غير متاحة مؤقتًا.",
    unavailableTitle: "تعذر تحميل مهمة الاسترجاع",
    vehicleReady: "المركبة جاهزة",
    vehicle: "المركبة",
    reportIssue: "الإبلاغ عن مشكلة",
    zone: "المنطقة",
    spot: "الموقع",
    scanQr: "مسح رمز QR",
    closeScanner: "إغلاق الماسح",
    manualHint: "يمكنك إدخال الرمز يدويًا في أي وقت أدناه.",
  },
};

export function getNativeRetrievalCopy(locale: FoundationLocale) {
  return copy[locale];
}
