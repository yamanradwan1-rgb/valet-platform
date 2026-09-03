import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeTasksCopy {
  readonly accept: string;
  readonly accepted: string;
  readonly ambiguousShifts: string;
  readonly conflict: string;
  readonly empty: string;
  readonly error: string;
  readonly loading: string;
  readonly location: string;
  readonly noShift: string;
  readonly organization: string;
  readonly processing: string;
  readonly reconcile: string;
  readonly refresh: string;
  readonly retry: string;
  readonly role: string;
  readonly shift: string;
  readonly status: string;
  readonly tasks: string;
  readonly unknownResult: string;
  readonly version: string;
}

const copy: Record<FoundationLocale, NativeTasksCopy> = {
  en: {
    accept: "Accept",
    accepted: "Accepted from current server state.",
    ambiguousShifts: "More than one active Shift needs resolution.",
    conflict: "The Task changed. Current server state is shown.",
    empty: "No Parking Tasks are currently available.",
    error: "Operational state is temporarily unavailable.",
    loading: "Loading current operational state…",
    location: "Location",
    noShift: "No active eligible Shift.",
    organization: "Organization",
    processing: "Accepting…",
    reconcile: "Checking current server state…",
    refresh: "Refresh",
    retry: "Retry accept",
    role: "Role",
    shift: "Shift",
    status: "Status",
    tasks: "Parking Tasks",
    unknownResult:
      "Accept result is unknown. Refresh server state before retrying.",
    version: "Version",
  },
  ar: {
    accept: "قبول",
    accepted: "تم القبول وفق حالة الخادم الحالية.",
    ambiguousShifts: "توجد أكثر من وردية نشطة وتحتاج إلى معالجة.",
    conflict: "تغيرت المهمة. تظهر الآن حالة الخادم الحالية.",
    empty: "لا توجد مهام صف مركبات متاحة حاليًا.",
    error: "الحالة التشغيلية غير متاحة مؤقتًا.",
    loading: "جارٍ تحميل الحالة التشغيلية الحالية…",
    location: "الموقع",
    noShift: "لا توجد وردية نشطة مؤهلة.",
    organization: "المنشأة",
    processing: "جارٍ القبول…",
    reconcile: "جارٍ التحقق من حالة الخادم الحالية…",
    refresh: "تحديث",
    retry: "إعادة محاولة القبول",
    role: "الدور",
    shift: "الوردية",
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
