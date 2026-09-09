import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeCheckInCopy {
  readonly back: string;
  readonly cancel: string;
  readonly checkServer: string;
  readonly close: string;
  readonly confirmDescription: string;
  readonly confirmPlate: string;
  readonly continueLabel: string;
  readonly continueToCustomer: string;
  readonly continueWithoutRecognition: string;
  readonly country: string;
  readonly locationTrackingParking: string;
  readonly parkingState: string;
  readonly parkingStartFailed: string;
  readonly parkingTask: string;
  readonly startParking: string;
  readonly startingParking: string;
  readonly customerContact: string;
  readonly color: string;
  readonly correctVehicleDetails: string;
  readonly done: string;
  readonly differentCustomer: string;
  readonly detected: string;
  readonly discoveryError: string;
  readonly discoveryErrorTitle: string;
  readonly discoveryTitle: string;
  readonly edit: string;
  readonly enterManually: string;
  readonly enterPlate: string;
  readonly intakeUnknown: string;
  readonly intakeUnknownTitle: string;
  readonly loading: string;
  readonly manualEntry: string;
  readonly enteredPlate: string;
  readonly highConfidence: string;
  readonly multiple: string;
  readonly newVehicle: string;
  readonly noPhone: string;
  readonly noPlate: string;
  readonly noPlateExample: string;
  readonly phone: string;
  readonly make: string;
  readonly model: string;
  readonly notSpecified: string;
  readonly phoneAmbiguous: string;
  readonly savedCustomerStale: string;
  readonly phoneEnding: string;
  readonly plate: string;
  readonly previousAssociation: string;
  readonly recognitionError: string;
  readonly recognizing: string;
  readonly recognizingTitle: string;
  readonly recoverableSessions: string;
  readonly recoverableContinuation: string;
  readonly recoverableDraft: string;
  readonly retryDiscovery: string;
  readonly retrySame: string;
  readonly savedBody: string;
  readonly skipVehicleDetails: string;
  readonly smsNotice: string;
  readonly scanPlate: string;
  readonly submitting: string;
  readonly submittingTitle: string;
  readonly title: string;
  readonly temporaryDescriptor: string;
  readonly unreadable: string;
  readonly useSavedCustomer: string;
  readonly unknown: string;
  readonly returningCustomer: string;
  readonly vehicle: string;
  readonly vehicleDescription: string;
  readonly vehicleDetails: string;
  readonly vehicleDescriptionExample: string;
  readonly vehicleFound: string;
  readonly awaitingParkingBody: string;
  readonly awaitingParkingTitle: string;
  readonly countryNames: Readonly<
    Record<"JO" | "AE" | "SA" | "KW" | "BH" | "OTHER", string>
  >;
}

const COPY: Record<EmployeeLocale, NativeCheckInCopy> = {
  en: {
    back: "Back",
    cancel: "Cancel",
    checkServer: "Check server state",
    close: "Back to tasks",
    confirmDescription: "Confirm Vehicle Description",
    confirmPlate: "Confirm Plate",
    continueLabel: "Continue",
    continueToCustomer: "Continue to customer",
    continueWithoutRecognition: "Continue without recognition",
    country: "Country / Region",
    locationTrackingParking:
      "Location tracking will activate for this parking task",
    parkingState: "Parking",
    parkingStartFailed: "The operation failed. Refresh and try again.",
    parkingTask: "Parking Task",
    startParking: "Start Parking",
    startingParking: "Starting Parking...",
    customerContact: "Customer Contact",
    color: "Color",
    correctVehicleDetails: "Correct vehicle details",
    done: "Done",
    differentCustomer: "Different customer",
    detected: "Detected",
    discoveryError: "Check-in state is temporarily unavailable.",
    discoveryErrorTitle: "Failed to load check-in session",
    discoveryTitle: "Check-In Discovery",
    edit: "Edit",
    enterManually: "Enter manually",
    enterPlate: "Enter Plate",
    intakeUnknown:
      "The server result is unknown. Check authoritative state before retrying the same intake.",
    intakeUnknownTitle: "Intake result unknown",
    loading: "Checking for existing check-in drafts...",
    manualEntry: "Manual Entry",
    enteredPlate: "Entered plate",
    highConfidence: "High confidence",
    multiple: "Multiple Incomplete Check-Ins Found",
    newVehicle: "New Vehicle",
    noPhone: "No phone available",
    noPlate: "No plate / unreadable plate",
    noPlateExample: "Example: Silver Toyota SUV",
    phone: "Mobile Number",
    make: "Make",
    model: "Model",
    notSpecified: "Not specified",
    phoneAmbiguous:
      "This phone matches more than one customer. Enter another phone or continue without a phone; no customer was selected.",
    savedCustomerStale:
      "The saved customer association is no longer valid. Enter the current customer's phone or continue without a phone.",
    phoneEnding: "Phone ending",
    plate: "License Plate",
    previousAssociation:
      "Previously associated with this vehicle during a completed VAYLET visit.",
    recognitionError:
      "Exact recognition is unavailable. You may retry or continue with current input.",
    recognizing: "Checking exact returning vehicle…",
    recognizingTitle: "Checking vehicle",
    recoverableSessions: "Recoverable Sessions",
    recoverableContinuation: "Awaiting parking",
    recoverableDraft: "Draft",
    retryDiscovery: "Retry Discovery",
    retrySame: "Retry same check-in",
    savedBody:
      "Use this previous association only if it matches the customer in front of you.",
    skipVehicleDetails: "Skip vehicle details",
    smsNotice:
      "Guest Access can be shared by QR or copied link after check-in.",
    scanPlate: "Scan Plate",
    submitting: "Creating Intake...",
    submittingTitle: "Creating Intake...",
    title: "New Vehicle Check-In",
    temporaryDescriptor: "Temporary Descriptor",
    unreadable: "Vehicle description",
    useSavedCustomer: "Use saved customer",
    unknown: "Unknown",
    returningCustomer: "Returning customer",
    vehicle: "Vehicle",
    vehicleDescription: "Vehicle description",
    vehicleDetails: "Vehicle details",
    vehicleDescriptionExample: "Silver Toyota SUV",
    vehicleFound: "Vehicle found",
    awaitingParkingBody:
      "This authoritative check-in is awaiting its current Parking Task.",
    awaitingParkingTitle: "Ready for parking",
    countryNames: {
      JO: "Jordan",
      AE: "United Arab Emirates",
      SA: "Saudi Arabia",
      KW: "Kuwait",
      BH: "Bahrain",
      OTHER: "Other",
    },
  },
  ar: {
    back: "رجوع",
    cancel: "إلغاء",
    checkServer: "تحقق من حالة الخادم",
    close: "العودة إلى المهام",
    confirmDescription: "تأكيد وصف المركبة",
    confirmPlate: "تأكيد اللوحة",
    continueLabel: "متابعة",
    continueToCustomer: "متابعة لإدخال رقم العميل",
    continueWithoutRecognition: "متابعة بدون التحقق من المركبة",
    country: "الدولة / المنطقة",
    locationTrackingParking: "سيتم تفعيل تتبع الموقع لمهمة الركن هذه",
    parkingState: "الركن",
    parkingStartFailed: "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    parkingTask: "مهمة الإيقاف",
    startParking: "بدء الإيقاف",
    startingParking: "جارٍ بدء الإيقاف...",
    customerContact: "بيانات تواصل العميل",
    color: "اللون",
    correctVehicleDetails: "تصحيح بيانات المركبة",
    done: "تم",
    differentCustomer: "عميل مختلف",
    detected: "تم الاكتشاف",
    discoveryError: "حالة تسجيل الوصول غير متاحة مؤقتاً.",
    discoveryErrorTitle: "تعذر تحميل جلسة تسجيل المركبة",
    discoveryTitle: "استعادة تسجيل الدخول",
    edit: "تعديل",
    enterManually: "إدخال يدوي",
    enterPlate: "إدخال اللوحة",
    intakeUnknown:
      "نتيجة إنشاء سجل الوصول على الخادم غير معروفة. تحقق من الحالة المعتمدة قبل إعادة محاولة سجل الوصول نفسه.",
    intakeUnknownTitle: "نتيجة سجل الوصول غير معروفة",
    loading: "جارٍ التحقق من عمليات التسجيل غير المكتملة...",
    manualEntry: "إدخال يدوي",
    enteredPlate: "لوحة مدخلة",
    highConfidence: "ثقة عالية",
    multiple: "تم العثور على عدة عمليات غير مكتملة",
    newVehicle: "مركبة جديدة",
    noPhone: "المتابعة دون رقم هاتف",
    noPlate: "لا توجد لوحة / اللوحة غير مقروءة",
    noPlateExample: "مثال: تويوتا فضية دفع رباعي",
    phone: "رقم الهاتف المحمول",
    make: "الشركة المصنّعة",
    model: "الطراز",
    notSpecified: "غير محدد",
    phoneAmbiguous:
      "يطابق هذا الرقم أكثر من عميل. أدخل رقماً آخر أو تابع دون رقم هاتف؛ لم يُحدَّد أي عميل.",
    savedCustomerStale:
      "لم يعد ارتباط العميل المحفوظ صالحاً. أدخل رقم هاتف العميل الحالي أو تابع دون رقم هاتف.",
    phoneEnding: "رقم الهاتف ينتهي بـ",
    plate: "لوحة المركبة",
    previousAssociation:
      "ارتبط هذا العميل سابقاً بهذه المركبة خلال زيارة مكتملة في VAYLET.",
    recognitionError:
      "التعرّف الدقيق غير متاح. يمكنك إعادة المحاولة أو المتابعة بالبيانات الحالية.",
    recognizing: "جارٍ التحقق من المركبة المطابقة بدقة…",
    recognizingTitle: "جارٍ التحقق من المركبة",
    recoverableSessions: "الجلسات القابلة للاستئناف",
    recoverableContinuation: "بانتظار الاصطفاف",
    recoverableDraft: "مسودة",
    retryDiscovery: "إعادة محاولة الاستعادة",
    retrySame: "إعادة محاولة سجل الوصول نفسه",
    savedBody: "استخدم الارتباط السابق فقط إذا كان يطابق العميل الموجود أمامك.",
    skipVehicleDetails: "تخطي بيانات المركبة",
    smsNotice:
      "يمكن مشاركة وصول الضيف عبر رمز QR أو الرابط المنسوخ بعد تسجيل الوصول.",
    scanPlate: "مسح اللوحة",
    submitting: "جارٍ إنشاء سجل الوصول...",
    submittingTitle: "جارٍ إنشاء سجل الوصول...",
    title: "تسجيل وصول مركبة جديدة",
    temporaryDescriptor: "وصف مؤقت",
    unreadable: "وصف المركبة",
    useSavedCustomer: "استخدام العميل المحفوظ",
    unknown: "غير معروف",
    returningCustomer: "عميل عائد",
    vehicle: "المركبة",
    vehicleDescription: "وصف المركبة",
    vehicleDetails: "تفاصيل المركبة",
    vehicleDescriptionExample: "سيارة تويوتا فضية",
    vehicleFound: "تم العثور على المركبة",
    awaitingParkingBody: "تسجيل الوصول المعتمد بانتظار مهمة الاصطفاف الحالية.",
    awaitingParkingTitle: "جاهزة للاصطفاف",
    countryNames: {
      JO: "الأردن",
      AE: "الإمارات",
      SA: "السعودية",
      KW: "الكويت",
      BH: "البحرين",
      OTHER: "أخرى",
    },
  },
};

export function getNativeCheckInCopy(
  locale: EmployeeLocale,
): NativeCheckInCopy {
  return COPY[locale];
}
