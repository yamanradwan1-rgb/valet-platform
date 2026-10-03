import type { FoundationLocale } from "../foundation/foundation-locale";

const en = {
  cancelService: "Cancel Service",
  title: "Cancel valet service?",
  body: "The customer no longer wants valet service. Pending Parking work will be cancelled. History will be retained.",
  confirm: "Confirm cancellation",
  dismiss: "Keep service",
  cancelling: "Cancelling service…",
  unknown:
    "The cancellation result is unknown. Check the server before trying again.",
  checkState: "Check server state",
  retry: "Retry cancellation",
  notCancelled: "Service is still active. Confirm again to retry cancellation.",
  conflict: "Service can no longer be cancelled before Parking.",
  back: "Back to Tasks",
  openParking: "Open Parking",
  openingParking: "Opening Parking…",
};
const ar: typeof en = {
  cancelService: "إلغاء الخدمة",
  title: "إلغاء خدمة صف المركبة؟",
  body: "لم يعد العميل يريد الخدمة. سيتم إلغاء مهمة الصف المعلقة مع الاحتفاظ بالسجل.",
  confirm: "تأكيد الإلغاء",
  dismiss: "الإبقاء على الخدمة",
  cancelling: "جارٍ إلغاء الخدمة…",
  unknown: "نتيجة الإلغاء غير معروفة. تحقق من الخادم قبل المحاولة مجدداً.",
  checkState: "التحقق من حالة الخادم",
  retry: "إعادة محاولة الإلغاء",
  notCancelled: "الخدمة ما زالت نشطة. أكّد مجدداً لإعادة محاولة الإلغاء.",
  conflict: "لم يعد بالإمكان إلغاء الخدمة قبل بدء الصف.",
  back: "العودة إلى المهام",
  openParking: "فتح مهمة الصف",
  openingParking: "جارٍ فتح مهمة الصف…",
};
export function getNativeParkingCancellationCopy(locale: FoundationLocale) {
  return locale === "ar" ? ar : en;
}
