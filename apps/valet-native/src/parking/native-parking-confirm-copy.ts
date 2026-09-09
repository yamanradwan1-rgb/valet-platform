import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeParkingConfirmCopy {
  readonly ambiguousBody: string;
  readonly ambiguousTitle: string;
  readonly back: string;
  readonly backToTasks: string;
  readonly checkState: string;
  readonly confirm: string;
  readonly confirming: string;
  readonly continueLabel: string;
  readonly keySlot: string;
  readonly parkedTitle: string;
  readonly parkingSpot: string;
  readonly location: string;
  readonly noNetwork: string;
  readonly scanAgain: string;
  readonly spotCode: string;
  readonly vehicle: string;
  readonly zone: string;
  readonly parkingArea: string;
  readonly spot: string;
  readonly done: string;
  readonly parkingConfirmed: string;
  readonly parking: string;
  readonly reviewAgain: string;
  readonly slotBody: string;
  readonly slotConflict: string;
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
    checkState: "Check server state",
    confirm: "Confirm Parked",
    confirming: "Confirming Parked…",
    continueLabel: "Continue",
    done: "Done",
    keySlot: "Key slot",
    parkedTitle: "Vehicle parked and key returned",
    parkingConfirmed: "Parking confirmed",
    parking: "Parking",
    parkingSpot: "Parking Spot",
    location: "Location",
    noNetwork: "No network connection. Reconnect to confirm this action.",
    scanAgain: "Scan again",
    spotCode: "Spot Code",
    vehicle: "Vehicle",
    zone: "Zone",
    parkingArea: "Parking area",
    spot: "Spot",
    reviewAgain:
      "Parking is not yet confirmed. Review the current details and confirm again.",
    slotBody:
      "Place the key into any available free slot, then scan or enter that slot's code.",
    slotConflict: "This key slot is no longer available. Scan another slot.",
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
    checkState: "تحقق من حالة الخادم",
    confirm: "تأكيد الإيقاف",
    confirming: "جارٍ تأكيد الإيقاف…",
    continueLabel: "متابعة",
    done: "تم",
    keySlot: "خانة المفتاح",
    parkedTitle: "تم صف السيارة وإعادة المفتاح",
    parkingConfirmed: "تم تأكيد الإيقاف",
    parking: "الركن",
    parkingSpot: "موقع الإيقاف",
    location: "الموقع",
    noNetwork: "لا يوجد اتصال بالشبكة. أعد الاتصال لتأكيد هذا الإجراء.",
    scanAgain: "المسح مجدداً",
    spotCode: "رمز الموقع",
    vehicle: "المركبة",
    zone: "المنطقة",
    parkingArea: "منطقة الإيقاف",
    spot: "الموقع",
    reviewAgain:
      "لم يتم تأكيد الاصطفاف بعد. راجع التفاصيل الحالية ثم أكد مرة أخرى.",
    slotBody:
      "ضع المفتاح في أي خانة فارغة متاحة، ثم امسح رمزها أو أدخل رمز الخانة.",
    slotConflict: "هذه الخانة لم تعد متاحة. امسح خانة أخرى.",
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
