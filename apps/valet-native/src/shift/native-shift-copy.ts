import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeShiftCopy {
  readonly activeShift: string;
  readonly cancel: string;
  readonly cashAmountPlaceholder: string;
  readonly cashExpected: string;
  readonly cashReported: string;
  readonly cashReportedHelper: string;
  readonly cashReportedValidation: string;
  readonly cashVariance: string;
  readonly chooseLocation: string;
  readonly conflict: string;
  readonly denied: string;
  readonly dismiss: string;
  readonly elapsed: string;
  readonly endShift: string;
  readonly endShiftConfirm: string;
  readonly endShiftConfirmMessage: string;
  readonly endShiftError: string;
  readonly endShiftUncertain: string;
  readonly endShiftUncertainTitle: string;
  readonly endingShift: string;
  readonly error: string;
  readonly location: string;
  readonly noEligibleLocation: string;
  readonly noNetwork: string;
  readonly openWorkBlocked: string;
  readonly organization: string;
  readonly retryStart: string;
  readonly retryEnd: string;
  readonly reviewTasks: string;
  readonly role: string;
  readonly roleEmployee: string;
  readonly roleSupervisor: string;
  readonly shift: string;
  readonly shiftEnded: string;
  readonly start: string;
  readonly started: string;
  readonly starting: string;
  readonly uncertain: string;
  readonly uncertainTitle: string;
  readonly verifying: string;
  readonly returnToStart: string;
}

const copy: Record<EmployeeLocale, NativeShiftCopy> = {
  en: {
    activeShift: "Active shift",
    cancel: "Cancel",
    cashAmountPlaceholder: "Enter cash amount",
    cashExpected: "Cash expected",
    cashReported: "Cash reported",
    cashReportedHelper: "Cash physically held at the end of this shift.",
    cashReportedValidation:
      "Enter a valid non-negative cash amount using up to three decimal places.",
    cashVariance: "Variance",
    chooseLocation: "Choose your shift location",
    conflict: "You already have an active shift at a different location.",
    denied: "You no longer have permission to start a shift here.",
    dismiss: "Dismiss",
    elapsed: "Elapsed",
    endShift: "End Shift",
    endShiftConfirm: "Confirm end shift",
    endShiftConfirmMessage:
      "End this shift now? The reported cash amount is recorded permanently and this cannot be undone.",
    endShiftError: "End Shift could not be completed. Try again.",
    endShiftUncertain:
      "The connection dropped before the result was confirmed. Your shift may or may not have ended. Reconnect and retry the same end shift action; do not start assuming it succeeded.",
    endShiftUncertainTitle: "Confirm your end shift result",
    endingShift: "Ending shift...",
    error: "Start Shift could not be completed. Try again.",
    location: "Location",
    noEligibleLocation:
      "No startable location is available for your account right now.",
    noNetwork: "No network connection. Reconnect to refresh and continue.",
    openWorkBlocked:
      "Open work must be handed over before the shift can end. Complete or hand over your assigned tasks first.",
    organization: "Organization",
    retryStart: "Retry start shift",
    retryEnd: "Retry end shift",
    reviewTasks: "Review assigned tasks",
    returnToStart: "Return to Start Shift",
    role: "Role",
    roleEmployee: "Valet Employee",
    roleSupervisor: "Valet Supervisor",
    shift: "Shift",
    shiftEnded: "Shift ended",
    start: "Start Shift",
    started: "Started",
    starting: "Starting shift...",
    uncertain:
      "The connection dropped before the result was confirmed. A shift may or may not have been started. Reconnect and retry the same start action; do not assume it succeeded.",
    uncertainTitle: "Confirm your start shift result",
    verifying: "Confirming the active shift...",
  },
  ar: {
    activeShift: "مناوبة نشطة",
    cancel: "إلغاء",
    cashAmountPlaceholder: "أدخل المبلغ النقدي",
    cashExpected: "النقد المتوقع",
    cashReported: "المبلغ النقدي المبلغ عنه",
    cashReportedHelper: "المبلغ النقدي الموجود معك فعليًا عند إنهاء المناوبة.",
    cashReportedValidation:
      "أدخل مبلغًا نقديًا صالحًا غير سالب بحد أقصى ثلاث منازل عشرية.",
    cashVariance: "الفارق",
    chooseLocation: "اختر موقع مناوبتك",
    conflict: "لديك مناوبة نشطة بالفعل في موقع آخر.",
    denied: "لم يعد لديك إذن لبدء مناوبة هنا.",
    dismiss: "تجاهل",
    elapsed: "الوقت المنقضي",
    endShift: "إنهاء المناوبة",
    endShiftConfirm: "تأكيد إنهاء المناوبة",
    endShiftConfirmMessage:
      "هل تريد إنهاء هذه المناوبة الآن؟ يُسجَّل المبلغ النقدي المبلغ عنه بشكل نهائي ولا يمكن التراجع.",
    endShiftError: "تعذر إكمال إنهاء المناوبة. أعد المحاولة.",
    endShiftUncertain:
      "انقطع الاتصال قبل تأكيد النتيجة. قد تكون المناوبة قد انتهت أو لا. أعد الاتصال وأعد محاولة نفس إجراء إنهاء المناوبة، ولا تفترض أنها نجحت.",
    endShiftUncertainTitle: "أكّد نتيجة إنهاء المناوبة",
    endingShift: "جارٍ إنهاء المناوبة...",
    error: "تعذر إكمال بدء المناوبة. أعد المحاولة.",
    location: "الموقع",
    noEligibleLocation: "لا يوجد موقع قابل للبدء متاح لحسابك حالياً.",
    noNetwork: "لا يوجد اتصال بالشبكة. أعد الاتصال للتحديث والمتابعة.",
    openWorkBlocked:
      "يجب تسليم العمل الجاري قبل إنهاء المناوبة. أكمل مهامك المعينة أو سلمها أولاً.",
    organization: "المؤسسة",
    retryStart: "إعادة محاولة بدء المناوبة",
    retryEnd: "إعادة محاولة إنهاء المناوبة",
    reviewTasks: "مراجعة المهام المعينة",
    returnToStart: "العودة إلى بدء المناوبة",
    role: "الدور",
    roleEmployee: "موظف صف سيارات",
    roleSupervisor: "مشرف صف سيارات",
    shift: "المناوبة",
    shiftEnded: "تم إنهاء المناوبة",
    start: "بدء المناوبة",
    started: "بدأت",
    starting: "جارٍ بدء المناوبة...",
    uncertain:
      "انقطع الاتصال قبل تأكيد النتيجة. قد تكون المناوبة قد بدأت أو لا. أعد الاتصال وأعد محاولة نفس إجراء البدء، ولا تفترض أنه نجح.",
    uncertainTitle: "أكّد نتيجة بدء المناوبة",
    verifying: "جارٍ تأكيد المناوبة النشطة...",
  },
};

export function getNativeShiftCopy(locale: EmployeeLocale): NativeShiftCopy {
  return copy[locale];
}
