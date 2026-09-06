import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeCheckInContinuationCopy {
  readonly authoritative: string;
  readonly cancel: string;
  readonly checkState: string;
  readonly checkingState: string;
  readonly color: string;
  readonly confirmPlateBody: string;
  readonly confirmPlateSave: string;
  readonly conflictBody: string;
  readonly conflictTitle: string;
  readonly correctionUnknown: string;
  readonly correctionUnknownTitle: string;
  readonly custodyConflict: string;
  readonly descriptor: string;
  readonly detailsNoChange: string;
  readonly detailsSaved: string;
  readonly editDetails: string;
  readonly editIdentity: string;
  readonly identitySaved: string;
  readonly identityConflict: string;
  readonly invalid: string;
  readonly make: string;
  readonly model: string;
  readonly notMutable: string;
  readonly plateCountry: string;
  readonly plateNumber: string;
  readonly reconciled: string;
  readonly reviewPlate: string;
  readonly saveDescription: string;
  readonly saveDetails: string;
  readonly saving: string;
  readonly title: string;
  readonly unknown: string;
  readonly useDescriptor: string;
  readonly usePlate: string;
}

const COPY: Record<EmployeeLocale, NativeCheckInContinuationCopy> = {
  en: {
    authoritative: "Authoritative vehicle",
    cancel: "Cancel",
    checkState: "Check server state",
    checkingState: "Checking authoritative vehicle…",
    color: "Color",
    confirmPlateBody:
      "Confirm that this plate matches the vehicle in front of you before saving.",
    confirmPlateSave: "Confirm and save plate",
    conflictBody:
      "Another operation changed this vehicle. The current server values are shown below; review them before editing again.",
    conflictTitle: "Vehicle changed",
    correctionUnknown:
      "The correction result is unknown. Check the authoritative vehicle before making another change.",
    correctionUnknownTitle: "Correction result unknown",
    custodyConflict:
      "This identity cannot be changed during another active custody operation.",
    descriptor: "Vehicle description",
    detailsNoChange: "Vehicle details already matched. No change was recorded.",
    detailsSaved: "Vehicle details updated.",
    editDetails: "Edit make, model, and color",
    editIdentity: "Edit vehicle identity",
    identitySaved: "Vehicle identity updated.",
    identityConflict: "This plate belongs to another vehicle record.",
    invalid: "Review the vehicle values and correct the invalid entry.",
    make: "Make",
    model: "Model",
    notMutable: "This check-in no longer permits vehicle changes.",
    plateCountry: "Plate country code",
    plateNumber: "License plate",
    reconciled: "The authoritative vehicle confirms the requested correction.",
    reviewPlate: "Review plate",
    saveDescription: "Save vehicle description",
    saveDetails: "Save vehicle details",
    saving: "Saving authoritative vehicle…",
    title: "Vehicle details",
    unknown: "Unknown",
    useDescriptor: "No plate / description",
    usePlate: "License plate",
  },
  ar: {
    authoritative: "بيانات المركبة المعتمدة",
    cancel: "إلغاء",
    checkState: "تحقق من حالة الخادم",
    checkingState: "جارٍ التحقق من بيانات المركبة المعتمدة…",
    color: "اللون",
    confirmPlateBody:
      "تأكد من أن هذه اللوحة تطابق المركبة الموجودة أمامك قبل الحفظ.",
    confirmPlateSave: "تأكيد اللوحة وحفظها",
    conflictBody:
      "غيّرت عملية أخرى بيانات هذه المركبة. تظهر أدناه القيم الحالية من الخادم؛ راجعها قبل التعديل مجدداً.",
    conflictTitle: "تغيّرت بيانات المركبة",
    correctionUnknown:
      "نتيجة التصحيح غير معروفة. تحقق من بيانات المركبة المعتمدة قبل إجراء تغيير آخر.",
    correctionUnknownTitle: "نتيجة التصحيح غير معروفة",
    custodyConflict:
      "لا يمكن تغيير هذه الهوية أثناء وجود عملية عهدة نشطة أخرى.",
    descriptor: "وصف المركبة",
    detailsNoChange: "تفاصيل المركبة مطابقة بالفعل. لم يُسجّل أي تغيير.",
    detailsSaved: "تم تحديث تفاصيل المركبة.",
    editDetails: "تعديل الصنع والطراز واللون",
    editIdentity: "تعديل هوية المركبة",
    identitySaved: "تم تحديث هوية المركبة.",
    identityConflict: "هذه اللوحة مرتبطة بسجل مركبة آخر.",
    invalid: "راجع بيانات المركبة وصحح القيمة غير الصالحة.",
    make: "الصنع",
    model: "الطراز",
    notMutable: "لم يعد تسجيل الوصول هذا يسمح بتغيير بيانات المركبة.",
    plateCountry: "رمز دولة اللوحة",
    plateNumber: "لوحة المركبة",
    reconciled: "تؤكد بيانات المركبة المعتمدة التصحيح المطلوب.",
    reviewPlate: "مراجعة اللوحة",
    saveDescription: "حفظ وصف المركبة",
    saveDetails: "حفظ تفاصيل المركبة",
    saving: "جارٍ حفظ بيانات المركبة المعتمدة…",
    title: "تفاصيل المركبة",
    unknown: "غير معروف",
    useDescriptor: "لا توجد لوحة / وصف",
    usePlate: "لوحة المركبة",
  },
};

export function getNativeCheckInContinuationCopy(
  locale: EmployeeLocale,
): NativeCheckInContinuationCopy {
  return COPY[locale];
}
