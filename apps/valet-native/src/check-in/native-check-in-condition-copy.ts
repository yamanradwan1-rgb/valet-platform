import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeCheckInConditionCopy {
  readonly checkingConditionState: string;
  readonly conditionCompletedStatus: string;
  readonly completingCondition: string;
  readonly conditionUnknown: string;
  readonly conditionUnknownTitle: string;
  readonly conflictBody: string;
  readonly conflictTitle: string;
  readonly existingDamage: string;
  readonly genericFailure: string;
  readonly needsReview: string;
  readonly noVisibleIssue: string;
  readonly photoRequired: string;
  readonly photoPolicyNotice: string;
  readonly selected: string;
  readonly title: string;
}

const COPY: Record<EmployeeLocale, NativeCheckInConditionCopy> = {
  en: {
    checkingConditionState: "Checking authoritative check-in…",
    conditionCompletedStatus: "Ready for parking",
    completingCondition: "Completing Condition…",
    conditionUnknown:
      "The condition result is unknown. Check the authoritative session before retrying; the recorded note was preserved and will not be duplicated.",
    conditionUnknownTitle: "Condition result unknown",
    conflictBody:
      "Another operation changed this check-in. The current server state is shown; review it and try again.",
    conflictTitle: "Check-in changed",
    existingDamage: "Existing damage",
    genericFailure:
      "The condition step could not be completed. Review the current state and try again.",
    needsReview: "Needs review",
    noVisibleIssue: "No visible issue",
    photoRequired:
      "This location requires condition photos. This step cannot continue on this device yet.",
    photoPolicyNotice:
      "Photo requirements are confirmed by the location policy when you continue.",
    selected: "Selected",
    title: "Vehicle Condition",
  },
  ar: {
    checkingConditionState: "جارٍ التحقق من سجل الوصول المعتمد…",
    conditionCompletedStatus: "جاهزة للاصطفاف",
    completingCondition: "جارٍ إكمال حالة المركبة...",
    conditionUnknown:
      "نتيجة فحص الحالة غير معروفة. تحقق من الجلسة المعتمدة قبل إعادة المحاولة؛ تم حفظ الملاحظة المسجلة ولن تُكرَّر.",
    conditionUnknownTitle: "نتيجة فحص الحالة غير معروفة",
    conflictBody:
      "غيّرت عملية أخرى سجل الوصول هذا. تظهر أدناه الحالة الحالية من الخادم؛ راجعها وأعد المحاولة.",
    conflictTitle: "تغيّر سجل الوصول",
    existingDamage: "ضرر موجود مسبقًا",
    genericFailure:
      "تعذر إكمال خطوة فحص الحالة. راجع الحالة الحالية وأعد المحاولة.",
    needsReview: "تحتاج مراجعة",
    noVisibleIssue: "لا توجد مشاكل ظاهرة",
    photoRequired:
      "يتطلب هذا الموقع صوراً لحالة المركبة. لا يمكن متابعة هذه الخطوة على هذا الجهاز بعد.",
    photoPolicyNotice:
      "سيتم التحقق من متطلبات الصور وفق سياسة الموقع عند المتابعة.",
    selected: "محدد",
    title: "حالة المركبة",
  },
};

export function getNativeCheckInConditionCopy(
  locale: EmployeeLocale,
): NativeCheckInConditionCopy {
  return COPY[locale];
}
