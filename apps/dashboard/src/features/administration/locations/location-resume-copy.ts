import type { DashboardLocale } from "../../../lib/i18n/locale";

export function locationResumeCopy(locale: DashboardLocale) {
  return locale === "ar"
    ? {
        action: "إعادة فتح استقبال السيارات",
        confirm:
          "هل تريد إعادة فتح استقبال السيارات في هذا الموقع؟ تستمر الشفتات والأعمال التشغيلية الحالية.",
        success: "أُعيد فتح استقبال السيارات. جارٍ تحديث حالة الموقع.",
        conflict:
          "تغيّرت حالة الموقع. راجع الحالة المحدّثة قبل التأكيد مجددًا.",
        denied: "لم يعد هذا الإجراء مصرحًا به. حدّث سياق لوحة التحكم.",
        unknown:
          "تعذّر تأكيد نتيجة إعادة فتح الاستقبال. حدّث حالة الموقع قبل إعادة الإرسال.",
        failure: "تعذّرت إعادة فتح الاستقبال. راجع حالة الموقع وحاول مجددًا.",
      }
    : {
        action: "Resume Intake",
        confirm:
          "Reopen intake for new vehicles at this Location? Existing shifts and operational work will continue.",
        success: "Intake resumed. Refreshing current Location state.",
        conflict:
          "The Location changed. Review refreshed state before confirming again.",
        denied:
          "This action is no longer authorized. Refresh your Dashboard context.",
        unknown:
          "Could not confirm whether intake resumed. Refresh Location state before submitting again.",
        failure:
          "Could not resume intake. Review the Location state and try again.",
      };
}
