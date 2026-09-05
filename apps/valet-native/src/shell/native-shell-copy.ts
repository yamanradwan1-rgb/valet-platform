import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeShellCopy {
  readonly accessDeniedBody: string;
  readonly accessDeniedTitle: string;
  readonly arabic: string;
  readonly authErrorTitle: string;
  readonly authRecoveryTitle: string;
  readonly back: string;
  readonly checkIn: string;
  readonly chooseLanguage: string;
  readonly contextErrorBody: string;
  readonly contextErrorTitle: string;
  readonly english: string;
  readonly loadingContext: string;
  readonly multipleShiftsBody: string;
  readonly noLocationBody: string;
  readonly noLocationTitle: string;
  readonly noShiftBody: string;
  readonly noShiftTitle: string;
  readonly retry: string;
  readonly scan: string;
  readonly shift: string;
  readonly signOut: string;
  readonly staffSignIn: string;
  readonly tasks: string;
  readonly unavailable: string;
  readonly vehicles: string;
}

const copy: Record<EmployeeLocale, NativeShellCopy> = {
  en: {
    accessDeniedBody:
      "This account does not currently have eligible employee access. Protected work remains blocked.",
    accessDeniedTitle: "Employee access unavailable",
    arabic: "Arabic",
    authErrorTitle: "Secure sign-in unavailable",
    authRecoveryTitle: "Could not restore sign-in",
    back: "Back",
    checkIn: "New vehicle",
    chooseLanguage: "Choose language",
    contextErrorBody:
      "Current operational context could not be confirmed. Retry before continuing.",
    contextErrorTitle: "Could not load operational context",
    english: "English",
    loadingContext: "Loading operational context...",
    multipleShiftsBody:
      "More than one active Shift needs resolution before protected work can continue.",
    noLocationBody:
      "No active Location is available for this employee membership. Contact a manager or try again.",
    noLocationTitle: "No available Location",
    noShiftBody:
      "There is no active Shift for an available Location. Shift start is not available in this version.",
    noShiftTitle: "No active Shift",
    retry: "Retry",
    scan: "Scan",
    shift: "Shift",
    signOut: "Sign out",
    staffSignIn: "Staff sign in",
    tasks: "Tasks",
    unavailable: "Not available yet",
    vehicles: "Vehicles",
  },
  ar: {
    accessDeniedBody:
      "لا يملك هذا الحساب حاليًا وصول موظف مؤهل. يظل العمل المحمي محظورًا.",
    accessDeniedTitle: "وصول الموظف غير متاح",
    arabic: "العربية",
    authErrorTitle: "تسجيل الدخول الآمن غير متاح",
    authRecoveryTitle: "تعذرت استعادة تسجيل الدخول",
    back: "رجوع",
    checkIn: "مركبة جديدة",
    chooseLanguage: "اختر اللغة",
    contextErrorBody:
      "تعذر تأكيد سياق العمليات الحالي. أعد المحاولة قبل المتابعة.",
    contextErrorTitle: "تعذر تحميل سياق العمليات",
    english: "الإنجليزية",
    loadingContext: "جارٍ تحميل السياق التشغيلي...",
    multipleShiftsBody:
      "توجد أكثر من وردية نشطة وتحتاج إلى معالجة قبل متابعة العمل المحمي.",
    noLocationBody:
      "لا يوجد موقع نشط متاح لعضوية هذا الموظف. تواصل مع المدير أو أعد المحاولة.",
    noLocationTitle: "لا يوجد موقع متاح",
    noShiftBody:
      "لا توجد وردية نشطة لموقع متاح. بدء الوردية غير متاح في هذا الإصدار.",
    noShiftTitle: "لا توجد وردية نشطة",
    retry: "إعادة المحاولة",
    scan: "مسح",
    shift: "الوردية",
    signOut: "تسجيل الخروج",
    staffSignIn: "تسجيل دخول الموظفين",
    tasks: "المهام",
    unavailable: "غير متاح بعد",
    vehicles: "المركبات",
  },
};

export function getNativeShellCopy(locale: EmployeeLocale): NativeShellCopy {
  return copy[locale];
}
