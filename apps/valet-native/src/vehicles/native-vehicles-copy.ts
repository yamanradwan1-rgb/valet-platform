import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeVehiclesCopy {
  readonly checkedIn: string;
  readonly descriptorMissing: string;
  readonly detailReadOnly: string;
  readonly emptyDetail: string;
  readonly emptyTitle: string;
  readonly keySlot: string;
  readonly loadFailed: string;
  readonly loading: string;
  readonly location: string;
  readonly noPlate: string;
  readonly notAssigned: string;
  readonly operationFailed: string;
  readonly parkingArea: string;
  readonly refreshing: string;
  readonly retry: string;
  readonly spot: string;
  readonly status: string;
  readonly truncated: string;
  readonly updated: string;
  readonly vehicles: string;
  readonly zone: string;
  readonly badges: Record<string, string>;
}

const copy: Record<FoundationLocale, NativeVehiclesCopy> = {
  en: {
    checkedIn: "Checked in",
    descriptorMissing: "Details pending",
    detailReadOnly: "Read-only view — actions stay in their own workflows.",
    emptyDetail:
      "Vehicles appear here while check-in, parking or retrieval is in progress.",
    emptyTitle: "No active vehicles right now",
    keySlot: "Key slot",
    loadFailed: "The vehicle list could not be loaded.",
    loading: "Loading vehicles...",
    location: "Location",
    noPlate: "No plate",
    notAssigned: "Not assigned",
    operationFailed: "The operation failed. Refresh and try again.",
    parkingArea: "Parking area",
    refreshing: "Refreshing...",
    retry: "Retry",
    spot: "Spot Code",
    status: "Status",
    truncated:
      "Showing the most recent active vehicles only. More vehicles may exist beyond this list.",
    updated: "Updated",
    vehicles: "Vehicles",
    zone: "Zone",
    badges: {
      CHECKING_IN: "Check-in",
      AWAITING_PARKING: "Queued",
      PARKING: "Parking",
      PARKED: "Parked",
      REQUESTED: "Requested",
      RETRIEVING: "Retrieval",
      READY: "Ready for pickup",
      HANDOFF_PENDING: "Handoff",
    },
  },
  ar: {
    checkedIn: "وقت الدخول",
    descriptorMissing: "التفاصيل قيد الإدخال",
    detailReadOnly: "عرض للقراءة فقط — تُنفَّذ الإجراءات من مهامها الخاصة.",
    emptyDetail:
      "تظهر المركبات هنا أثناء تنفيذ التسجيل أو الإيقاف أو الاسترجاع.",
    emptyTitle: "لا توجد مركبات نشطة الآن",
    keySlot: "خانة المفتاح",
    loadFailed: "تعذّر تحميل قائمة المركبات.",
    loading: "جارٍ تحميل المركبات...",
    location: "الموقع",
    noPlate: "دون لوحة",
    notAssigned: "غير معين",
    operationFailed: "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    parkingArea: "منطقة الإيقاف",
    refreshing: "جارٍ التحديث...",
    retry: "إعادة المحاولة",
    spot: "رمز الموقع",
    status: "الحالة",
    truncated:
      "يتم عرض أحدث المركبات النشطة فقط. قد توجد مركبات إضافية خارج هذه القائمة.",
    updated: "آخر تحديث",
    vehicles: "المركبات",
    zone: "المنطقة",
    badges: {
      CHECKING_IN: "تسجيل الوصول",
      AWAITING_PARKING: "في قائمة الانتظار",
      PARKING: "الركن",
      PARKED: "مركونة",
      REQUESTED: "مطلوبة",
      RETRIEVING: "الاسترجاع",
      READY: "جاهز للاستلام",
      HANDOFF_PENDING: "التسليم",
    },
  },
};

export function getNativeVehiclesCopy(locale: FoundationLocale) {
  return copy[locale];
}
