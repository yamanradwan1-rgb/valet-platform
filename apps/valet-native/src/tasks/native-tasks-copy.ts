import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeTasksCopy {
  readonly accept: string;
  readonly accepted: string;
  readonly activeShift: string;
  readonly ambiguousShifts: string;
  readonly conflict: string;
  readonly empty: string;
  readonly error: string;
  readonly loading: string;
  readonly noShift: string;
  readonly processing: string;
  readonly reconcile: string;
  readonly refresh: string;
  readonly retry: string;
  readonly status: string;
  readonly tasks: string;
  readonly unknownResult: string;
  readonly version: string;
}

const copy: Record<FoundationLocale, NativeTasksCopy> = {
  en: {
    accept: "Accept",
    accepted: "Accepted from current server state.",
    activeShift: "Active shift",
    ambiguousShifts: "More than one active Shift needs resolution.",
    conflict: "The Task changed. Current server state is shown.",
    empty: "No Parking Tasks are currently available.",
    error: "Operational state is temporarily unavailable.",
    loading: "Loading current operational state…",
    noShift: "No active eligible Shift.",
    processing: "Accepting…",
    reconcile: "Checking current server state…",
    refresh: "Refresh",
    retry: "Retry accept",
    status: "Status",
    tasks: "Parking Tasks",
    unknownResult:
      "Accept result is unknown. Refresh server state before retrying.",
    version: "Version",
  },
  ar: {
    accept: "قبول",
    accepted: "تم القبول وفق حالة الخادم الحالية.",
    activeShift: "وردية نشطة",
    ambiguousShifts: "توجد أكثر من وردية نشطة وتحتاج إلى معالجة.",
    conflict: "تغيرت المهمة. تظهر الآن حالة الخادم الحالية.",
    empty: "لا توجد مهام صف مركبات متاحة حاليًا.",
    error: "الحالة التشغيلية غير متاحة مؤقتًا.",
    loading: "جارٍ تحميل الحالة التشغيلية الحالية…",
    noShift: "لا توجد وردية نشطة مؤهلة.",
    processing: "جارٍ القبول…",
    reconcile: "جارٍ التحقق من حالة الخادم الحالية…",
    refresh: "تحديث",
    retry: "إعادة محاولة القبول",
    status: "الحالة",
    tasks: "مهام صف المركبات",
    unknownResult:
      "نتيجة القبول غير معروفة. حدّث حالة الخادم قبل إعادة المحاولة.",
    version: "الإصدار",
  },
};

export function getNativeTasksCopy(locale: FoundationLocale): NativeTasksCopy {
  return copy[locale];
}
