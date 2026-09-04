import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeCheckInCopy {
  readonly back: string;
  readonly checkServer: string;
  readonly close: string;
  readonly confirmDescription: string;
  readonly confirmPlate: string;
  readonly continueLabel: string;
  readonly continueWithoutRecognition: string;
  readonly country: string;
  readonly createdBody: string;
  readonly createdTitle: string;
  readonly customerContact: string;
  readonly differentCustomer: string;
  readonly discoveryError: string;
  readonly edit: string;
  readonly enterPlate: string;
  readonly intakeUnknown: string;
  readonly loading: string;
  readonly manualOnly: string;
  readonly multiple: string;
  readonly noPhone: string;
  readonly noPlate: string;
  readonly noPlateExample: string;
  readonly phone: string;
  readonly phoneEnding: string;
  readonly plate: string;
  readonly previousAssociation: string;
  readonly recognitionError: string;
  readonly recognizing: string;
  readonly recoverableContinuation: string;
  readonly recoverableDraft: string;
  readonly retry: string;
  readonly retrySame: string;
  readonly savedBody: string;
  readonly scanPlate: string;
  readonly submitting: string;
  readonly title: string;
  readonly unreadable: string;
  readonly useSavedCustomer: string;
  readonly vehicle: string;
  readonly vehicleFound: string;
  readonly awaitingParkingBody: string;
  readonly awaitingParkingTitle: string;
}

const COPY: Record<EmployeeLocale, NativeCheckInCopy> = {
  en: {
    back: "Back",
    checkServer: "Check server state",
    close: "Back to tasks",
    confirmDescription: "Confirm vehicle description",
    confirmPlate: "Confirm plate",
    continueLabel: "Continue",
    continueWithoutRecognition: "Continue without recognition",
    country: "Plate country",
    createdBody:
      "The authoritative intake is saved. Vehicle Condition is the next step. Continue in Employee Web until that Native workflow is available.",
    createdTitle: "Intake saved",
    customerContact: "Customer contact",
    differentCustomer: "Different customer",
    discoveryError: "Check-in state is temporarily unavailable.",
    edit: "Edit",
    enterPlate: "Enter plate manually",
    intakeUnknown:
      "The server result is unknown. Check authoritative state before retrying the same intake.",
    loading: "Checking saved check-ins…",
    manualOnly:
      "Enter and confirm the plate, or describe the vehicle if the plate is unreadable.",
    multiple: "Choose the check-in you want to resume.",
    noPhone: "Continue without phone",
    noPlate: "No / unreadable plate",
    noPlateExample: "Example: Silver Toyota SUV",
    phone: "Mobile number",
    phoneEnding: "Phone ending",
    plate: "License plate",
    previousAssociation:
      "Previously associated with this vehicle during a completed VAYLET visit.",
    recognitionError:
      "Exact recognition is unavailable. You may retry or continue with current input.",
    recognizing: "Checking exact returning vehicle…",
    recoverableContinuation: "Awaiting parking",
    recoverableDraft: "Draft",
    retry: "Retry",
    retrySame: "Retry same check-in",
    savedBody:
      "Use this previous association only if it matches the customer in front of you.",
    scanPlate: "Vehicle identification",
    submitting: "Creating authoritative intake…",
    title: "New vehicle check-in",
    unreadable: "Vehicle description",
    useSavedCustomer: "Use saved customer",
    vehicle: "Vehicle",
    vehicleFound: "Vehicle found",
    awaitingParkingBody:
      "This check-in is already complete and awaiting the Native parking workflow. No state was changed locally.",
    awaitingParkingTitle: "Ready for parking",
  },
  ar: {
    back: "رجوع",
    checkServer: "تحقق من حالة الخادم",
    close: "العودة إلى المهام",
    confirmDescription: "تأكيد وصف المركبة",
    confirmPlate: "تأكيد اللوحة",
    continueLabel: "متابعة",
    continueWithoutRecognition: "المتابعة دون تعرّف",
    country: "بلد اللوحة",
    createdBody:
      "تم حفظ الاستلام المعتمد. فحص حالة المركبة هو الخطوة التالية. تابع في تطبيق الموظف على الويب حتى يتوفر هذا المسار هنا.",
    createdTitle: "تم حفظ الاستلام",
    customerContact: "بيانات تواصل العميل",
    differentCustomer: "عميل مختلف",
    discoveryError: "حالة تسجيل الوصول غير متاحة مؤقتاً.",
    edit: "تعديل",
    enterPlate: "إدخال اللوحة يدوياً",
    intakeUnknown:
      "نتيجة الخادم غير معروفة. تحقق من الحالة المعتمدة قبل إعادة محاولة نفس الاستلام.",
    loading: "جارٍ التحقق من عمليات الاستلام المحفوظة…",
    manualOnly:
      "أدخل اللوحة وأكّدها، أو صِف المركبة إذا كانت اللوحة غير مقروءة.",
    multiple: "اختر عملية تسجيل الوصول التي تريد متابعتها.",
    noPhone: "المتابعة دون رقم هاتف",
    noPlate: "لا توجد لوحة / غير مقروءة",
    noPlateExample: "مثال: تويوتا فضية دفع رباعي",
    phone: "رقم الهاتف المحمول",
    phoneEnding: "رقم الهاتف المنتهي بـ",
    plate: "رقم اللوحة",
    previousAssociation:
      "ارتبط هذا العميل سابقاً بهذه المركبة خلال زيارة مكتملة في VAYLET.",
    recognitionError:
      "التعرّف الدقيق غير متاح. يمكنك إعادة المحاولة أو المتابعة بالبيانات الحالية.",
    recognizing: "جارٍ التحقق من المركبة المطابقة بدقة…",
    recoverableContinuation: "بانتظار الاصطفاف",
    recoverableDraft: "مسودة",
    retry: "إعادة المحاولة",
    retrySame: "إعادة محاولة نفس الاستلام",
    savedBody: "استخدم الارتباط السابق فقط إذا كان يطابق العميل الموجود أمامك.",
    scanPlate: "تعريف المركبة",
    submitting: "جارٍ إنشاء الاستلام المعتمد…",
    title: "تسجيل وصول مركبة جديدة",
    unreadable: "وصف المركبة",
    useSavedCustomer: "استخدام العميل المحفوظ",
    vehicle: "المركبة",
    vehicleFound: "تم العثور على المركبة",
    awaitingParkingBody:
      "اكتمل تسجيل الوصول وهو بانتظار مسار الاصطفاف الأصلي. لم يتم تغيير أي حالة محلياً.",
    awaitingParkingTitle: "جاهزة للاصطفاف",
  },
};

export function getNativeCheckInCopy(
  locale: EmployeeLocale,
): NativeCheckInCopy {
  return COPY[locale];
}
