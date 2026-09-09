import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeTasksCopy {
  readonly acceptTask: string;
  readonly acceptAndPark: string;
  readonly actionFailed: string;
  readonly accessChanged: string;
  readonly age: string;
  readonly activeShift: string;
  readonly ambiguousShifts: string;
  readonly claimParking: string;
  readonly claimRetrieval: string;
  readonly empty: string;
  readonly error: string;
  readonly dismiss: string;
  readonly loading: string;
  readonly otherStaff: string;
  readonly newVehicle: string;
  readonly now: string;
  readonly openRetrieval: string;
  readonly overrideHandoff: string;
  readonly parking: string;
  readonly queue: string;
  readonly noShift: string;
  readonly processing: string;
  readonly continueParking: string;
  readonly retrieval: string;
  readonly retrievalAlertBody: string;
  readonly retrievalAlertTitle: string;
  readonly requested: string;
  readonly status: string;
  readonly statusAccepted: string;
  readonly statusAssigned: string;
  readonly statusInProgress: string;
  readonly statusQueued: string;
  readonly startParking: string;
  readonly continueRetrieval: string;
  readonly tasks: string;
}

const copy: Record<FoundationLocale, NativeTasksCopy> = {
  en: {
    acceptTask: "Accept Task",
    acceptAndPark: "Accept & Park",
    actionFailed: "The operation failed. Refresh and try again.",
    accessChanged: "Task access changed. Refresh your operational context.",
    age: "Age",
    activeShift: "Shift active",
    ambiguousShifts: "More than one active Shift needs resolution.",
    claimParking: "Claim & Park",
    claimRetrieval: "Accept Task",
    dismiss: "Dismiss",
    empty: "No Tasks are currently available.",
    error: "Operational state is temporarily unavailable.",
    loading: "Loading current operational state…",
    noShift: "No active eligible Shift.",
    otherStaff: "Other staff",
    newVehicle: "New Vehicle",
    now: "now",
    openRetrieval: "Open Retrieval",
    overrideHandoff: "Override Handoff",
    parking: "Parking",
    queue: "Queue",
    processing: "Processing...",
    continueParking: "Continue Parking",
    retrieval: "Retrieval",
    retrievalAlertBody: "A guest has requested their vehicle.",
    retrievalAlertTitle: "Vehicle requested",
    requested: "Requested",
    status: "Status",
    statusAccepted: "Active",
    statusAssigned: "Assigned",
    statusInProgress: "In progress",
    statusQueued: "Queued",
    startParking: "Start Parking",
    continueRetrieval: "Continue Retrieval",
    tasks: "Tasks",
  },
  ar: {
    acceptTask: "قبول المهمة",
    acceptAndPark: "قبول وبدء الإيقاف",
    actionFailed: "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    accessChanged: "تغير صلاحية الوصول إلى المهام. حدّث السياق التشغيلي.",
    age: "العمر",
    activeShift: "المناوبة نشطة",
    ambiguousShifts: "توجد أكثر من وردية نشطة وتحتاج إلى معالجة.",
    claimParking: "استلام وإيقاف",
    claimRetrieval: "قبول المهمة",
    dismiss: "إخفاء",
    empty: "لا توجد مهام متاحة حاليًا.",
    error: "الحالة التشغيلية غير متاحة مؤقتًا.",
    loading: "جارٍ تحميل الحالة التشغيلية الحالية…",
    noShift: "لا توجد وردية نشطة مؤهلة.",
    otherStaff: "موظف آخر",
    newVehicle: "مركبة جديدة",
    now: "الآن",
    openRetrieval: "فتح الاسترجاع",
    overrideHandoff: "تجاوز التسليم",
    parking: "الركن",
    queue: "قائمة الانتظار",
    processing: "جارٍ المعالجة...",
    continueParking: "متابعة الإيقاف",
    retrieval: "الاسترجاع",
    retrievalAlertBody: "طلب أحد الضيوف استرجاع مركبته.",
    retrievalAlertTitle: "تم طلب المركبة",
    requested: "مطلوبة",
    status: "الحالة",
    statusAccepted: "نشط",
    statusAssigned: "معينة",
    statusInProgress: "قيد التنفيذ",
    statusQueued: "في قائمة الانتظار",
    startParking: "بدء الإيقاف",
    continueRetrieval: "متابعة الاسترجاع",
    tasks: "المهام",
  },
};

export function getNativeTasksCopy(locale: FoundationLocale): NativeTasksCopy {
  return copy[locale];
}
