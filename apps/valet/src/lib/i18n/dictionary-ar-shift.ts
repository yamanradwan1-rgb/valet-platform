/**
 * النسخة العربية لنصوص دورة حياة المناوبة (VUI-011A/VUI-011D): بدء المناوبة،
 * إنهاء المناوبة، حالة النتيجة غير المؤكدة، إدخال النقد ووحدات المدة المنقضية.
 * مفصولة عن القاموس الأساسي للحفاظ على حدود هيكلية الملفات (docs/17).
 */
export const employeeArabicShiftDictionary = {
  activeShiftLabel: "مناوبة نشطة",
  cashAmountPlaceholder: "أدخل المبلغ النقدي",
  cashExpectedLabel: "النقد المتوقع",
  cashReportedHelper:
    "المبلغ النقدي الموجود معك فعليًا عند إنهاء المناوبة.",
  cashReportedLabel: "المبلغ النقدي المبلغ عنه",
  cashReportedValidation:
    "أدخل مبلغًا نقديًا صالحًا غير سالب بحد أقصى ثلاث منازل عشرية.",
  cashVarianceLabel: "الفارق",
  chooseLocationLabel: "اختر موقع مناوبتك",
  confirmEndShift: "تأكيد إنهاء المناوبة",
  dismissAction: "تجاهل",
  durationDayShort: "يوم",
  durationHourShort: "س",
  durationMinuteShort: "د",
  elapsed: "الوقت المنقضي",
  endingShift: "جارٍ إنهاء المناوبة...",
  endShiftAction: "إنهاء المناوبة",
  endShiftConfirmMessage:
    "هل تريد إنهاء هذه المناوبة الآن؟ يُسجَّل المبلغ النقدي المبلغ عنه بشكل نهائي ولا يمكن التراجع.",
  endShiftUncertain:
    "انقطع الاتصال قبل تأكيد النتيجة. قد تكون المناوبة قد انتهت أو لا. أعد الاتصال وأعد محاولة نفس إجراء إنهاء المناوبة، ولا تفترض أنها نجحت.",
  endShiftUncertainTitle: "أكّد نتيجة إنهاء المناوبة",
  noStartableLocationDetail:
    "لا يوجد موقع قابل للبدء متاح لحسابك حالياً.",
  openWorkBlocksEndShift:
    "يجب تسليم العمل الجاري قبل إنهاء المناوبة. أكمل مهامك المعينة أو سلمها أولاً.",
  reviewAssignedTasks: "مراجعة المهام المعينة",
  retryEndShift: "إعادة محاولة إنهاء المناوبة",
  retryStartShift: "إعادة محاولة بدء المناوبة",
  shiftEndedTitle: "تم إنهاء المناوبة",
  startShiftAction: "بدء المناوبة",
  startShiftConflict: "لديك مناوبة نشطة بالفعل في موقع آخر.",
  startShiftPrompt: "ابدأ مناوبة لبدء العمل التشغيلي.",
  startShiftUncertain:
    "انقطع الاتصال قبل تأكيد النتيجة. قد تكون المناوبة قد بدأت أو لا. أعد الاتصال وأعد محاولة نفس إجراء البدء، ولا تفترض أنه نجح.",
  startShiftUncertainTitle: "أكّد نتيجة بدء المناوبة",
  startedAtLabel: "بدأت",
  startingShift: "جارٍ بدء المناوبة...",
} as const;
