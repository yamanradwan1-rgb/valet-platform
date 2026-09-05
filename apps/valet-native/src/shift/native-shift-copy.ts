import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeShiftCopy {
  readonly activeShift: string;
  readonly chooseLocation: string;
  readonly conflict: string;
  readonly denied: string;
  readonly dismiss: string;
  readonly error: string;
  readonly location: string;
  readonly noEligibleLocation: string;
  readonly organization: string;
  readonly retryStart: string;
  readonly role: string;
  readonly roleEmployee: string;
  readonly roleSupervisor: string;
  readonly shift: string;
  readonly start: string;
  readonly started: string;
  readonly starting: string;
  readonly uncertain: string;
  readonly uncertainTitle: string;
  readonly verifying: string;
}

const copy: Record<EmployeeLocale, NativeShiftCopy> = {
  en: {
    activeShift: "Active shift",
    chooseLocation: "Choose your shift location",
    conflict: "You already have an active shift at a different location.",
    denied: "You no longer have permission to start a shift here.",
    dismiss: "Dismiss",
    error: "Start Shift could not be completed. Try again.",
    location: "Location",
    noEligibleLocation:
      "No startable location is available for your account right now.",
    organization: "Organization",
    retryStart: "Retry start shift",
    role: "Role",
    roleEmployee: "Valet Employee",
    roleSupervisor: "Valet Supervisor",
    shift: "Shift",
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
    chooseLocation: "اختر موقع مناوبتك",
    conflict: "لديك مناوبة نشطة بالفعل في موقع آخر.",
    denied: "لم يعد لديك إذن لبدء مناوبة هنا.",
    dismiss: "تجاهل",
    error: "تعذر إكمال بدء المناوبة. أعد المحاولة.",
    location: "الموقع",
    noEligibleLocation: "لا يوجد موقع قابل للبدء متاح لحسابك حالياً.",
    organization: "المؤسسة",
    retryStart: "إعادة محاولة بدء المناوبة",
    role: "الدور",
    roleEmployee: "موظف صف سيارات",
    roleSupervisor: "مشرف صف سيارات",
    shift: "المناوبة",
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
