/**
 * Minimal Employee i18n foundation: typed dictionary + locale resolution.
 * DEC-058-compatible (pure presentation layer). Locale is stored in a
 * first-party cookie so <html lang/dir> can be rendered server-side.
 */
export type EmployeeLocale = "en" | "ar";

export const LOCALE_COOKIE = "vaylet_employee_locale";

export function isEmployeeLocale(value: unknown): value is EmployeeLocale {
  return value === "en" || value === "ar";
}

export function localeDir(locale: EmployeeLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

const en = {
  appName: "VAYLET",
  tasksTitle: "Tasks",
  newVehicle: "New Vehicle",
  shiftActive: "Shift active",
  now: "now",
  queueLabel: "Queue",
  acceptTask: "Accept Task",
  assigned: "Assigned",
  claimAndPark: "Claim & Park",
  startParking: "Start Parking",
  continueParking: "Continue Parking",
  openRetrieval: "Open Retrieval",
  continueRetrieval: "Continue Retrieval",
  overrideHandoff: "Override Handoff",
  otherStaff: "Other staff",
  reportIssue: "Report Issue",
  vehicleReady: "Vehicle Ready",
  beginGuestHandoff: "Begin Guest Handoff",
  markReady: "Mark Ready",
  markingReady: "Marking Ready...",
  releasing: "Releasing…",
  releaseVehicle: "Release Vehicle",
  reportIncident: "Report Incident",
  openIncident: "Open Incident",
  opening: "Opening…",
  selectType: "Select type",
  severity: "Severity",
  description: "Description",
  describePlaceholder: "Briefly describe what happened...",
  incidentOpened: "Incident opened",
  reference: "Reference",
  vehicle: "Vehicle",
  key: "Key",
  returnLabel: "Return",
  nextTask: "Next Task",
  done: "Done",
  signIn: "Sign In",
  signingIn: "Signing in…",
  workEmail: "Work email",
  password: "Password",
  staffSignIn: "Staff sign in",
  checkingSession: "Checking staff session...",
  noActiveShift: "No active shift",
  noNetworkMessage: "No network connection. Reconnect to refresh and continue.",
  retry: "Retry",
  signOut: "Sign Out",
} as const satisfies Record<string, string>;

const ar: Record<keyof typeof en, string> = {
  appName: "فالييه",
  tasksTitle: "المهام",
  newVehicle: "مركبة جديدة",
  shiftActive: "الوردة نشطة",
  now: "الآن",
  queueLabel: "قائمة الانتظار",
  acceptTask: "قبول المهمة",
  assigned: "معينة",
  claimAndPark: "استلام وإيقاف",
  startParking: "بدء الإيقاف",
  continueParking: "متابعة الإيقاف",
  openRetrieval: "فتح الاسترجاع",
  continueRetrieval: "متابعة الاسترجاع",
  overrideHandoff: "تجاوز التسليم",
  otherStaff: "موظف آخر",
  reportIssue: "الإبلاغ عن مشكلة",
  vehicleReady: "المركبة جاهزة",
  beginGuestHandoff: "بدء تسليم الضيف",
  markReady: "جاهز",
  markingReady: "جارٍ التأكيد...",
  releasing: "جارٍ التسليم…",
  releaseVehicle: "تسليم المركبة",
  reportIncident: "الإبلاغ عن حادث",
  openIncident: "فتح الحادث",
  opening: "جارٍ الفتح…",
  selectType: "نوع الحادث",
  severity: "الأهمية",
  description: "الوصف",
  describePlaceholder: "صف ما حدث باختصار...",
  incidentOpened: "تم فتح الحادث",
  reference: "المرجع",
  vehicle: "المركبة",
  key: "المفتاح",
  returnLabel: "رجوع",
  nextTask: "المهمة التالية",
  done: "تم",
  signIn: "تسجيل الدخول",
  signingIn: "جارٍ تسجيل الدخول…",
  workEmail: "البريد الإلكتروني الوظيفي",
  password: "كلمة المرور",
  staffSignIn: "تسجيل دخول الموظفين",
  checkingSession: "جارٍ التحقق من الجلسة...",
  noActiveShift: "لا توجد وردة نشطة",
  noNetworkMessage: "لا يوجد اتصال بالشبكة. أعد الاتصال للتحديث والمتابعة.",
  retry: "إعادة المحاولة",
  signOut: "تسجيل الخروج",
};

export type EmployeeDictionary = Record<keyof typeof en, string>;

const dictionaries: Record<EmployeeLocale, EmployeeDictionary> = {
  en,
  ar,
};

export function employeeDictionary(
  locale: EmployeeLocale,
): EmployeeDictionary {
  return dictionaries[locale];
}
