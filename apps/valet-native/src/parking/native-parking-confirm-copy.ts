import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeParkingConfirmCopy {
  readonly ambiguousBody: string;
  readonly ambiguousTitle: string;
  readonly back: string;
  readonly backToTasks: string;
  readonly candidateOnly: string;
  readonly checkState: string;
  readonly confirm: string;
  readonly confirming: string;
  readonly continueLabel: string;
  readonly keySlot: string;
  readonly parkedBody: string;
  readonly parkedTitle: string;
  readonly parkingSpot: string;
  readonly reviewAgain: string;
  readonly slotBody: string;
  readonly slotConflict: string;
  readonly slotTitle: string;
  readonly spotBody: string;
  readonly spotConflict: string;
  readonly spotTitle: string;
  readonly stale: string;
  readonly taskTitle: string;
  readonly unavailableBody: string;
  readonly unavailableTitle: string;
}

const copy: Record<FoundationLocale, NativeParkingConfirmCopy> = {
  en: {
    ambiguousBody:
      "The Confirm Parked result is unknown. Check server state before taking another action.",
    ambiguousTitle: "Parking result unknown",
    back: "Back",
    backToTasks: "Back to tasks",
    candidateOnly:
      "Candidate only. The server checks this Key Slot when you confirm.",
    checkState: "Check server state",
    confirm: "Confirm Parked",
    confirming: "Confirming Parked…",
    continueLabel: "Continue to Key Slot",
    keySlot: "Key Slot",
    parkedBody: "Parking confirmed on the server.",
    parkedTitle: "Vehicle parked and key returned",
    parkingSpot: "Parking Spot",
    reviewAgain:
      "Parking is not yet confirmed. Review the current details and confirm again.",
    slotBody:
      "At the cabinet, place the key in an available slot, then scan or enter that slot.",
    slotConflict: "This key slot is no longer available. Scan another slot.",
    slotTitle: "Identify the actual Key Slot",
    spotBody:
      "After parking the vehicle, scan or enter the actual Parking Spot.",
    spotConflict:
      "This Parking Spot is no longer available. Choose another spot.",
    spotTitle: "Where is the vehicle parked?",
    stale:
      "Parking changed on the server. Review the current details and confirm again.",
    taskTitle: "Confirm Parked",
    unavailableBody: "Current Parking Task state is not available.",
    unavailableTitle: "Unable to continue Parking",
  },
  ar: {
    ambiguousBody:
      "نتيجة تأكيد الاصطفاف غير معروفة. تحقق من حالة الخادم قبل اتخاذ إجراء آخر.",
    ambiguousTitle: "نتيجة الاصطفاف غير معروفة",
    back: "رجوع",
    backToTasks: "العودة إلى المهام",
    candidateOnly: "هذا اختيار مبدئي فقط. يتحقق الخادم من الخانة عند التأكيد.",
    checkState: "تحقق من حالة الخادم",
    confirm: "تأكيد الاصطفاف",
    confirming: "جارٍ تأكيد الاصطفاف…",
    continueLabel: "المتابعة إلى خانة المفتاح",
    keySlot: "خانة المفتاح",
    parkedBody: "تم تأكيد الاصطفاف على الخادم.",
    parkedTitle: "تم صف السيارة وإعادة المفتاح",
    parkingSpot: "موقف المركبة",
    reviewAgain:
      "لم يتم تأكيد الاصطفاف بعد. راجع التفاصيل الحالية ثم أكد مرة أخرى.",
    slotBody: "عند الخزانة، ضع المفتاح في خانة متاحة ثم امسح رمزها أو أدخله.",
    slotConflict: "هذه الخانة لم تعد متاحة. امسح خانة أخرى.",
    slotTitle: "حدد خانة المفتاح الفعلية",
    spotBody: "بعد صف المركبة، امسح رمز موقفها الفعلي أو أدخله.",
    spotConflict: "موقف المركبة لم يعد متاحًا. اختر موقفًا آخر.",
    spotTitle: "أين تم صف المركبة؟",
    stale: "تغير الاصطفاف على الخادم. راجع التفاصيل الحالية وأكد مرة أخرى.",
    taskTitle: "تأكيد الاصطفاف",
    unavailableBody: "حالة مهمة الاصطفاف الحالية غير متاحة.",
    unavailableTitle: "تعذرت متابعة الاصطفاف",
  },
};

export function getNativeParkingConfirmCopy(locale: FoundationLocale) {
  return copy[locale];
}
