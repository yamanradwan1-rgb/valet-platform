/**
 * النسخة العربية لنصوص مركز المسح الواعي بالسياق (VUI-011B، قرار DEC-066 §5):
 * مشغّل يعتمد على سياقات سير العمل الموجودة فقط — دون أي دلالات كاميرا أو مسح.
 * مفصولة عن القاموس الأساسي للحفاظ على حدود هيكلية الملفات (docs/17).
 */
export const employeeArabicScanHubDictionary = {
  scanHubKeySlotDisabled: "افتح عملية المركبة أولاً.",
  scanHubLicensePlateSub: "تسجيل مركبة جديدة",
  scanHubParkingDisabled: "افتح مهمة إيقاف نشطة أولاً.",
  scanHubParkingResume: "استئناف عملية الإيقاف الجارية",
  scanHubPickupLabel: "الاستلام والتسليم",
  scanHubRetrievalDisabled: "افتح مهمة استرجاع نشطة أولاً.",
  scanHubRetrievalResume: "استئناف عملية الاسترجاع الجارية",
  scanHubSubtitle: "اختر كيف تريد المتابعة",
} as const;
