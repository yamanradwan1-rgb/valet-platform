import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeReleaseCopy {
  authorityBody: string;
  authorityTitle: string;
  back: string;
  cannotUndo: string;
  check: string;
  completedBody: string;
  completedTitle: string;
  conflictBody: string;
  dynamicQr: string;
  financialBody: string;
  identityVerified: string;
  nextTask: string;
  pickupCode: string;
  policyBody: string;
  releaseBlocked: string;
  releaseVehicle: string;
  releasing: string;
  supervisorOverride: string;
  taskTitle: string;
  unknownBody: string;
  unavailableBody: string;
  awaitingTaskOwner: string;
  reportIssue: string;
}

const values: Record<FoundationLocale, NativeReleaseCopy> = {
  en: {
    authorityBody:
      "The Retrieval task owner must complete the vehicle release.",
    authorityTitle: "Override recorded — awaiting task owner",
    back: "Back",
    cannotUndo:
      "This hands the vehicle and key to the guest and closes the task permanently. It cannot be undone.",
    check: "Check server state",
    completedBody: "Task completed and custody handed over.",
    completedTitle: "Handoff Complete",
    conflictBody:
      "Release authority or session state changed. Return to current Tasks before continuing.",
    dynamicQr: "Guest QR",
    financialBody: "The outstanding payment requirement is not satisfied yet.",
    identityVerified: "Identity verified",
    nextTask: "Next Task",
    pickupCode: "Pickup code",
    policyBody:
      "Current proof or release policy does not permit vehicle release.",
    releaseBlocked: "Release blocked",
    releaseVehicle: "Release Vehicle",
    releasing: "Releasing…",
    supervisorOverride: "Supervisor override",
    taskTitle: "Secure handoff",
    unknownBody:
      "The release result is unknown. Check server state before another action.",
    unavailableBody: "Current release state is unavailable.",
    awaitingTaskOwner: "Override recorded — awaiting task owner",
    reportIssue: "Report Issue",
  },
  ar: {
    authorityBody: "يجب أن يكمل مالك مهمة الاسترجاع تسليم المركبة.",
    authorityTitle: "تم تجاوز التحقق — في انتظار مالك المهمة",
    back: "رجوع",
    cannotUndo:
      "سيتم تسليم المركبة والمفتاح للضيف وإغلاق المهمة نهائياً. لا يمكن التراجع.",
    check: "تحقق من حالة الخادم",
    completedBody: "اكتملت المهمة وتم تسليم العهدة.",
    completedTitle: "اكتمل التسليم",
    conflictBody:
      "تغيرت صلاحية التسليم أو حالة الجلسة. ارجع إلى المهام الحالية قبل المتابعة.",
    dynamicQr: "رمز QR للضيف",
    financialBody: "لم يتم استيفاء متطلبات الدفع المستحقة بعد.",
    identityVerified: "تم التحقق من الهوية",
    nextTask: "المهمة التالية",
    pickupCode: "رمز الاستلام",
    policyBody: "لا يسمح الإثبات الحالي أو سياسة التسليم بتحرير المركبة.",
    releaseBlocked: "التسليم محظور",
    releaseVehicle: "تسليم المركبة",
    releasing: "جارٍ التسليم…",
    supervisorOverride: "تجاوز المشرف",
    taskTitle: "التسليم الآمن",
    unknownBody:
      "نتيجة تحرير المركبة غير معروفة. تحقق من حالة الخادم قبل أي إجراء آخر.",
    unavailableBody: "حالة تحرير المركبة الحالية غير متاحة.",
    awaitingTaskOwner: "تم تجاوز التحقق — في انتظار مالك المهمة",
    reportIssue: "الإبلاغ عن مشكلة",
  },
};

export function getNativeReleaseCopy(locale: FoundationLocale) {
  return values[locale];
}
