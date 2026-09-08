import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeTasksCopy {
  readonly accept: string;
  readonly accessChanged: string;
  readonly accepted: string;
  readonly age: string;
  readonly activeShift: string;
  readonly ambiguousShifts: string;
  readonly conflict: string;
  readonly claimParking: string;
  readonly claimRetrieval: string;
  readonly empty: string;
  readonly error: string;
  readonly dismiss: string;
  readonly loading: string;
  readonly otherStaff: string;
  readonly overrideHandoff: string;
  readonly parking: string;
  readonly priority: string;
  readonly rateLimited: string;
  readonly noShift: string;
  readonly processing: string;
  readonly continueParking: string;
  readonly reconcile: string;
  readonly refresh: string;
  readonly refreshing: string;
  readonly retrieval: string;
  readonly retrievalAlertBody: string;
  readonly retrievalAlertTitle: string;
  readonly requested: string;
  readonly retry: string;
  readonly status: string;
  readonly statusAccepted: string;
  readonly statusAssigned: string;
  readonly statusInProgress: string;
  readonly statusQueued: string;
  readonly startParking: string;
  readonly startRetrieval: string;
  readonly continueRetrieval: string;
  readonly stale: string;
  readonly tasks: string;
  readonly unknownResult: string;
  readonly version: string;
}

const copy: Record<FoundationLocale, NativeTasksCopy> = {
  en: {
    accept: "Accept",
    accessChanged: "Task access changed. Refresh your operational context.",
    accepted: "Accepted from current server state.",
    age: "Age",
    activeShift: "Active shift",
    ambiguousShifts: "More than one active Shift needs resolution.",
    conflict: "The Task changed. Current server state is shown.",
    claimParking: "Claim task",
    claimRetrieval: "Claim retrieval",
    dismiss: "Dismiss",
    empty: "No Tasks are currently available.",
    error: "Operational state is temporarily unavailable.",
    loading: "Loading current operational state…",
    noShift: "No active eligible Shift.",
    otherStaff: "Other staff",
    overrideHandoff: "Override Handoff",
    parking: "Parking",
    priority: "Priority task",
    rateLimited:
      "Task refresh is rate limited. The normal refresh cycle will resume.",
    processing: "Accepting…",
    continueParking: "Continue Parking",
    reconcile: "Checking current server state…",
    refresh: "Refresh",
    refreshing: "Refreshing current Tasks…",
    retrieval: "Retrieval",
    retrievalAlertBody: "A guest has requested their vehicle.",
    retrievalAlertTitle: "Vehicle requested",
    requested: "Requested",
    retry: "Retry task action",
    status: "Status",
    statusAccepted: "Accepted",
    statusAssigned: "Assigned",
    statusInProgress: "In progress",
    statusQueued: "Queued",
    startParking: "Start Parking",
    startRetrieval: "Start Retrieval",
    continueRetrieval: "Continue Retrieval",
    stale: "Showing the last verified queue while refresh is unavailable.",
    tasks: "Tasks",
    unknownResult:
      "Accept result is unknown. Refresh server state before retrying.",
    version: "Version",
  },
  ar: {
    accept: "قبول",
    accessChanged: "تغير صلاحية الوصول إلى المهام. حدّث السياق التشغيلي.",
    accepted: "تم القبول وفق حالة الخادم الحالية.",
    age: "المدة",
    activeShift: "وردية نشطة",
    ambiguousShifts: "توجد أكثر من وردية نشطة وتحتاج إلى معالجة.",
    conflict: "تغيرت المهمة. تظهر الآن حالة الخادم الحالية.",
    claimParking: "استلام المهمة",
    claimRetrieval: "استلام طلب الاسترجاع",
    dismiss: "إخفاء",
    empty: "لا توجد مهام متاحة حاليًا.",
    error: "الحالة التشغيلية غير متاحة مؤقتًا.",
    loading: "جارٍ تحميل الحالة التشغيلية الحالية…",
    noShift: "لا توجد وردية نشطة مؤهلة.",
    otherStaff: "موظف آخر",
    overrideHandoff: "تجاوز التسليم",
    parking: "صف المركبة",
    priority: "المهمة ذات الأولوية",
    rateLimited: "تم تقييد تحديث المهام مؤقتًا. ستستأنف دورة التحديث المعتادة.",
    processing: "جارٍ القبول…",
    continueParking: "متابعة الاصطفاف",
    reconcile: "جارٍ التحقق من حالة الخادم الحالية…",
    refresh: "تحديث",
    refreshing: "جارٍ تحديث المهام الحالية…",
    retrieval: "استرجاع المركبة",
    retrievalAlertBody: "طلب أحد الضيوف استرجاع مركبته.",
    retrievalAlertTitle: "تم طلب المركبة",
    requested: "مطلوبة",
    retry: "إعادة محاولة إجراء المهمة",
    status: "الحالة",
    statusAccepted: "مقبولة",
    statusAssigned: "مسندة",
    statusInProgress: "قيد التنفيذ",
    statusQueued: "في قائمة الانتظار",
    startParking: "بدء الاصطفاف",
    startRetrieval: "بدء الاسترجاع",
    continueRetrieval: "متابعة الاسترجاع",
    stale: "يتم عرض آخر قائمة مهام مؤكدة لتعذر التحديث.",
    tasks: "المهام",
    unknownResult:
      "نتيجة القبول غير معروفة. حدّث حالة الخادم قبل إعادة المحاولة.",
    version: "الإصدار",
  },
};

export function getNativeTasksCopy(locale: FoundationLocale): NativeTasksCopy {
  return copy[locale];
}
