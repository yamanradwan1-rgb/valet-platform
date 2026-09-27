import type { DashboardLocale } from "../../lib/i18n/locale";
import { analyticsCopy } from "./analytics-copy";

const terms: Record<string, readonly [string, string]> = {
  averageSeconds: ["Average duration", "متوسط المدة"],
  sampleCount: ["Sample count", "عدد العينات"],
  contributingLocationCount: ["Contributing Locations", "المواقع المساهمة"],
  locationCount: ["Locations", "المواقع"],
  periodStartUtc: ["Period start (UTC)", "بداية الفترة (UTC)"],
  periodEndUtc: ["Period end (UTC)", "نهاية الفترة (UTC)"],
  numerator: ["Numerator", "البسط"],
  denominator: ["Denominator", "المقام"],
  percentage: ["Percentage", "النسبة المئوية"],
  value: ["Value", "القيمة"],
  count: ["Count", "العدد"],
  carsHandedOff: ["Cars handed off", "السيارات المسلّمة"],
  distinctAttributedEmployeeCount: [
    "Distinct attributed employees",
    "الموظفون المميزون المسند إليهم",
  ],
  retrievalRequestedCount: ["Retrieval requests", "طلبات الاسترجاع"],
  dispatch: ["Dispatch", "الإسناد"],
  keyCustody: ["Key custody", "عهدة المفاتيح"],
  severity: ["Incident severity", "شدة الحادث"],
  type: ["Incident type", "نوع الحادث"],
  LOW: ["Low", "منخفضة"],
  MEDIUM: ["Medium", "متوسطة"],
  HIGH: ["High", "عالية"],
  CRITICAL: ["Critical", "حرجة"],
  PARKING: ["Parking", "الاصطفاف"],
  RETRIEVAL: ["Retrieval", "الاسترجاع"],
  QUEUED: ["Queued", "في قائمة الانتظار"],
  ASSIGNED: ["Assigned", "مسندة"],
  ACCEPTED: ["Accepted", "مقبولة"],
  DECLINED: ["Declined", "مرفوضة"],
  REASSIGNED: ["Reassigned", "أعيد إسنادها"],
  IN_PROGRESS: ["In progress", "قيد التنفيذ"],
  COMPLETED: ["Completed", "مكتملة"],
  CANCELLED: ["Cancelled", "ملغاة"],
  SLOT_ASSIGNED: ["Slot assigned", "تم تخصيص الخانة"],
  CHECKED_OUT: ["Checked out", "تم إخراج المفتاح"],
  RETURNED_TO_SLOT: ["Returned to slot", "أعيد إلى الخانة"],
  SLOT_CLEARED: ["Slot cleared", "تم إخلاء الخانة"],
  RELEASED: ["Released", "تم التسليم"],
  KEY_MISSING: ["Key missing", "مفتاح مفقود"],
  WRONG_KEY: ["Wrong key", "مفتاح خاطئ"],
  KEY_DAMAGED: ["Key damaged", "مفتاح تالف"],
  KEY_LOCKED_INSIDE: ["Key locked inside", "المفتاح مقفل بالداخل"],
};

/** Only labels change. Canonical keys and exact server values remain visible evidence. */
export function reportRowLabel(key: string, locale: DashboardLocale): string {
  const t = analyticsCopy(locale);
  const labels: Record<string, string> = {
    checkInTime: t.checkInTime,
    parkingTime: t.parkingTime,
    retrievalWait: t.retrievalWait,
    retrievalStartLatencyAuxiliary: t.retrievalStartAuxiliary,
    handoffTime: t.handoffTime,
    paidPaymentCount: t.paidPayments,
    collectedAmountTotal: t.collected,
    tipAmountTotal: t.tips,
    succeededRefundAmountTotal: t.refunds,
    digitalPaymentRate: t.digitalRate,
    validationRate: t.validationRate,
    currentValidationAmountTotal: t.currentValidation,
    cashExpectedTotal: t.cashExpected,
    cashReportedTotal: t.cashReported,
    cashVarianceTotal: t.cashVariance,
    totalLocationCount: t.totalLocations,
    activeLocationCount: t.activeLocations,
    inactiveLocationCount: t.inactiveLocations,
    incidentCount: t.incidents,
    incidentsPer1000: t.incidentsPer1000,
    slaCompliance: t.slaCompliance,
    carsPerActiveEmployee: t.carsPerActiveEmployee,
    keyExceptions: t.keyExceptions,
    missingTargetCount: t.missingTargets,
    invalidOrMissingIntervalCount: t.invalidIntervals,
    requestCount: t.requestCount,
    evidenceLocationCount: t.evidenceLocations,
    attributedCount: t.handoffAttributed,
    missingAttributionCount: t.handoffMissing,
  };
  return key
    .split(".")
    .map((part) => {
      if (Object.hasOwn(labels, part)) return labels[part]!;
      if (Object.hasOwn(terms, part))
        return terms[part]![locale === "ar" ? 1 : 0];
      return part;
    })
    .join(" · ");
}
