/**
 * Employee i18n typed dictionary + locale resolution.
 * DEC-058-compatible (pure presentation layer).
 */
export type EmployeeLocale = "en" | "ar";

export const LOCALE_COOKIE = "vaylet_employee_locale";

export function isEmployeeLocale(value: unknown): value is EmployeeLocale {
  return value === "en" || value === "ar";
}

export function localeDir(locale: EmployeeLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function readEmployeeLocale(cookieHeader?: string): EmployeeLocale {
  if (typeof cookieHeader !== "string") return "en";
  const match = cookieHeader
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.split("=")[1];
  return isEmployeeLocale(value) ? value : "en";
}

const en = {
  // App / nav
  appName: "VAYLET",
  tasksTitle: "Tasks",
  newVehicle: "New Vehicle",
  shiftActive: "Shift active",
  queueLabel: "Queue",
  ageLabel: "AGE",
  statusLabel: "STATUS",
  processing: "Processing...",
  otherStaff: "Other staff",
  // Task actions
  acceptTask: "Accept Task",
  assigned: "Assigned",
  claimAndPark: "Claim & Park",
  startParkingAction: "Start Parking",
  continueParking: "Continue Parking",
  openRetrieval: "Open Retrieval",
  continueRetrieval: "Continue Retrieval",
  overrideHandoff: "Override Handoff",
  // Check-in / parking / retrieval CTAs
  scanPlate: "Scan Plate",
  enterManually: "Enter manually",
  confirmPlate: "Confirm",
  customerPhone: "Customer Phone",
  continueLabel: "Continue",
  noVisibleIssue: "No visible issue",
  assignKeySlot: "Assign Key Slot",
  queueParkingTask: "Queue Parking Task",
  parkVehicle: "Park Vehicle",
  confirmParked: "Confirm Parked",
  parkingConfirmed: "Parking confirmed",
  parkingOperation: "Parking Operation",
  elapsed: "Elapsed",
  destination: "Destination",
  spotCode: "Spot code",
  retrievalOperation: "Retrieval Operation",
  retrievingLabel: "Retrieving",
  vehicleReadyTitle: "Vehicle Ready",
  markReady: "Mark Ready",
  markingReady: "Marking Ready...",
  expectedKeySlot: "Expected key slot",
  verifyKeySlot: "Verify Key Slot",
  startRetrievalAction: "Start Parking",
  // Handoff
  guestHandoffTitle: "Guest Handoff",
  beginGuestHandoff: "Begin Guest Handoff",
  startingHandoff: "Starting handoff...",
  readyForPickup: "Ready for pickup",
  awaitingGuestProof: "Awaiting guest proof",
  pickupCodeLabel: "Pickup code",
  verifyCode: "Verify Code",
  guestQrCode: "Guest QR code",
  verifyQr: "Verify QR",
  supervisorOverrideLabel: "Supervisor override",
  overrideVerification: "Override Verification",
  abortHandoff: "Abort Handoff",
  identityVerified: "Identity Verified",
  releaseVehicle: "Release Vehicle",
  releasing: "Releasing…",
  releaseBlocked: "Release blocked",
  handoffComplete: "Handoff Complete",
  awaitingTaskOwner: "Override recorded — awaiting task owner",
  cannotUndo:
    "This hands the vehicle and key to the guest and closes the task permanently. It cannot be undone.",
  reportIssue: "Report Issue",
  // Incident
  reportIncident: "Report Incident",
  selectType: "Select type",
  severityLabel: "Severity",
  descriptionLabel: "Description",
  describePlaceholder: "Briefly describe what happened...",
  openIncident: "Open Incident",
  opening: "Opening…",
  incidentOpened: "Incident opened",
  reference: "Reference",
  sessionLabel: "Session",
  returnToQueue: "Back to Task Queue",
  // Common
  vehicle: "Vehicle",
  key: "Key",
  returnLabel: "Return",
  nextTask: "Next Task",
  done: "Done",
  retry: "Retry",
  back: "Back",
  signOut: "Sign Out",
  // Auth / gates
  signIn: "Sign In",
  signingIn: "Signing in…",
  workEmail: "Work email",
  password: "Password",
  staffSignIn: "Staff sign in",
  checkingSession: "Checking staff session...",
  noActiveShift: "No active shift",
  loadingContext: "Loading operational context...",
  loadingSession: "Loading session context...",
  connectionIssue: "Connection issue",
  noNetworkMessage:
    "No network connection. Reconnect to refresh and continue.",
};

type Dict = Record<keyof typeof en, string>;

const ar: Dict = {
  appName: "فالييه",
  tasksTitle: "المهام",
  newVehicle: "مركبة جديدة",
  shiftActive: "الوردة نشطة",
  queueLabel: "قائمة الانتظار",
  ageLabel: "العمر",
  statusLabel: "الحالة",
  processing: "جارٍ المعالجة...",
  otherStaff: "موظف آخر",
  acceptTask: "قبول المهمة",
  assigned: "معينة",
  claimAndPark: "استلام وإيقاف",
  startParkingAction: "بدء الإيقاف",
  continueParking: "متابعة الإيقاف",
  openRetrieval: "فتح الاسترجاع",
  continueRetrieval: "متابعة الاسترجاع",
  overrideHandoff: "تجاوز التسليم",
  scanPlate: "مسح اللوحة",
  enterManually: "إدخال يدوي",
  confirmPlate: "تأكيد",
  customerPhone: "هاتف العميل",
  continueLabel: "متابعة",
  noVisibleIssue: "لا توجد مشاكل ظاهرة",
  assignKeySlot: "تعيين خانة المفتاح",
  queueParkingTask: "إنشاء مهمة إيقاف",
  parkVehicle: "إيقاف المركبة",
  confirmParked: "تأكيد الإيقاف",
  parkingConfirmed: "تم إيقاف المركبة",
  parkingOperation: "عملية الإيقاف",
  elapsed: "الوقت المنقضي",
  destination: "الوجهة",
  spotCode: "رمز الموقع",
  retrievalOperation: "عملية الاسترجاع",
  retrievingLabel: "جارٍ الاسترجاع",
  vehicleReadyTitle: "المركبة جاهزة",
  markReady: "جاهز",
  markingReady: "جارٍ التأكيد...",
  expectedKeySlot: "خانة المفتاح المتوقعة",
  verifyKeySlot: "تحقق من المفتاح",
  startRetrievalAction: "بدء الإيقاف",
  guestHandoffTitle: "تسليم الضيف",
  beginGuestHandoff: "بدء تسليم الضيف",
  startingHandoff: "جارٍ بدء التسليم...",
  readyForPickup: "جاهز للاستلام",
  awaitingGuestProof: "في انتظار إثبات الضيف",
  pickupCodeLabel: "رمز الاستلام",
  verifyCode: "تحقق من الرمز",
  guestQrCode: "رمز QR للضيف",
  verifyQr: "تحقق من QR",
  supervisorOverrideLabel: "تجاوز المشرف",
  overrideVerification: "تجاوز التحقق",
  abortHandoff: "إلغاء التسليم",
  identityVerified: "تم التحقق من الهوية",
  releaseVehicle: "تسليم المركبة",
  releasing: "جارٍ التسليم…",
  releaseBlocked: "التسليم محظور",
  handoffComplete: "اكتمل التسليم",
  awaitingTaskOwner: "تم تجاوز التحقق — في انتظار مالك المهمة",
  cannotUndo:
    "سيتم تسليم المركبة والمفتاح للضيف وإغلاق المهمة نهائياً. لا يمكن التراجع.",
  reportIssue: "الإبلاغ عن مشكلة",
  reportIncident: "الإبلاغ عن حادث",
  selectType: "نوع الحادث",
  severityLabel: "الأهمية",
  descriptionLabel: "الوصف",
  describePlaceholder: "صف ما حدث باختصار...",
  openIncident: "فتح الحادث",
  opening: "جارٍ الفتح…",
  incidentOpened: "تم فتح الحادث",
  reference: "المرجع",
  sessionLabel: "الجلسة",
  returnToQueue: "العودة لقائمة المهام",
  vehicle: "المركبة",
  key: "المفتاح",
  returnLabel: "رجوع",
  nextTask: "المهمة التالية",
  done: "تم",
  retry: "إعادة المحاولة",
  back: "رجوع",
  signOut: "تسجيل الخروج",
  signIn: "تسجيل الدخول",
  signingIn: "جارٍ تسجيل الدخول…",
  workEmail: "البريد الإلكتروني الوظيفي",
  password: "كلمة المرور",
  staffSignIn: "تسجيل دخول الموظفين",
  checkingSession: "جارٍ التحقق من الجلسة...",
  noActiveShift: "لا توجد وردة نشطة",
  loadingContext: "جارٍ تحميل السياق التشغيلي...",
  loadingSession: "جارٍ تحميل سياق الجلسة...",
  connectionIssue: "مشكلة في الاتصال",
  noNetworkMessage:
    "لا يوجد اتصال بالشبكة. أعد الاتصال للتحديث والمتابعة.",
};

export type EmployeeDictionary = Dict;

const dictionaries: Record<EmployeeLocale, EmployeeDictionary> = { en, ar };

export function employeeDictionary(locale: EmployeeLocale): EmployeeDictionary {
  return dictionaries[locale];
}
