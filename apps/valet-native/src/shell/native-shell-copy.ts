import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeShellCopy {
  readonly accessDeniedBody: string;
  readonly accessDeniedTitle: string;
  readonly activeShiftsFound: string;
  readonly ambiguousShiftDetail: string;
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
  readonly multipleShiftsTitle: string;
  readonly noLocationBody: string;
  readonly noLocationTitle: string;
  readonly noShiftBody: string;
  readonly noShiftTitle: string;
  readonly retry: string;
  readonly scan: string;
  readonly shift: string;
  readonly shiftNav: string;
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
    activeShiftsFound: "active shifts were found for your account.",
    ambiguousShiftDetail:
      "Operations are locked until only one active shift remains.",
    arabic: "Arabic",
    authErrorTitle: "Secure sign-in unavailable",
    authRecoveryTitle: "Could not restore sign-in",
    back: "Back",
    checkIn: "New vehicle",
    chooseLanguage: "Choose language",
    contextErrorBody: "The operation failed. Refresh and try again.",
    contextErrorTitle: "Could not load operational context",
    english: "English",
    loadingContext: "Loading operational context...",
    multipleShiftsBody:
      "More than one active Shift needs resolution before protected work can continue.",
    multipleShiftsTitle: "Multiple active shifts",
    noLocationBody:
      "No active Location is available for this employee membership. Contact a manager or try again.",
    noLocationTitle: "No available Location",
    noShiftBody: "Start a shift to begin operational work.",
    noShiftTitle: "No active shift",
    retry: "Retry",
    scan: "Scan",
    shift: "Shift",
    shiftNav: "Shift",
    signOut: "Sign Out",
    staffSignIn: "Staff sign in",
    tasks: "Tasks",
    unavailable: "Not available yet",
    vehicles: "Vehicles",
  },
  ar: {
    accessDeniedBody:
      "لا يملك هذا الحساب حاليًا وصول موظف مؤهل. يظل العمل المحمي محظورًا.",
    accessDeniedTitle: "وصول الموظف غير متاح",
    activeShiftsFound: "مناوبات نشطة وُجدت لحسابك.",
    ambiguousShiftDetail: "العمليات مقفلة حتى تبقى مناوبة نشطة واحدة فقط.",
    arabic: "العربية",
    authErrorTitle: "تسجيل الدخول الآمن غير متاح",
    authRecoveryTitle: "تعذرت استعادة تسجيل الدخول",
    back: "رجوع",
    checkIn: "مركبة جديدة",
    chooseLanguage: "اختر اللغة",
    contextErrorBody: "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    contextErrorTitle: "تعذر تحميل سياق العمليات",
    english: "الإنجليزية",
    loadingContext: "جارٍ تحميل السياق التشغيلي...",
    multipleShiftsBody:
      "توجد أكثر من وردية نشطة وتحتاج إلى معالجة قبل متابعة العمل المحمي.",
    multipleShiftsTitle: "مناوبات نشطة متعددة",
    noLocationBody:
      "لا يوجد موقع نشط متاح لعضوية هذا الموظف. تواصل مع المدير أو أعد المحاولة.",
    noLocationTitle: "لا يوجد موقع متاح",
    noShiftBody: "ابدأ مناوبة لبدء العمل التشغيلي.",
    noShiftTitle: "لا توجد وردية نشطة",
    retry: "إعادة المحاولة",
    scan: "مسح",
    shift: "الوردية",
    shiftNav: "المناوبة",
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
