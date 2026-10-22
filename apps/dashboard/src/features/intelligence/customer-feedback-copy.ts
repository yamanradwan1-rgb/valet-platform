import type { DashboardLocale } from "../../lib/i18n/locale";

const copy = {
  en: {
    heading: "Customer Feedback",
    average: "Average rating",
    participation: "Participation",
    coverage: "Rated / eligible completed visits",
    distribution: "Star distribution",
    recent: "Recent visit ratings",
    ratings: "ratings",
    star: "star",
    stars: "stars",
    completed: "Completed",
    submitted: "Rated",
    unavailable: "Not available",
    noRatings: "No ratings for eligible visits in this period.",
    noEligible: "No eligible completed visits in this period. Participation cannot be calculated.",
    periodRequired: "Select an analytics period to view customer feedback.",
    loading: "Loading customer feedback…",
    error: "Customer feedback could not be loaded.",
    denied: "Customer feedback is unavailable for the current authorized scope.",
    retry: "Retry",
    cohort: "Period based on completed visit date (Location-local), not when rating was submitted.",
  },
  ar: {
    heading: "تقييمات العملاء",
    average: "متوسط التقييم",
    participation: "نسبة المشاركة",
    coverage: "زيارات مقيّمة / زيارات مكتملة مؤهلة",
    distribution: "توزيع النجوم",
    recent: "أحدث تقييمات الزيارات",
    ratings: "تقييمًا",
    star: "نجمة",
    stars: "نجوم",
    completed: "مكتملة في",
    submitted: "تم تقييمها في",
    unavailable: "غير متاح",
    noRatings: "لا توجد تقييمات للزيارات المؤهلة خلال الفترة.",
    noEligible: "لا توجد زيارات مكتملة مؤهلة خلال الفترة. يتعذر حساب نسبة المشاركة.",
    periodRequired: "اختر فترة التحليلات لعرض تقييمات العملاء.",
    loading: "جارٍ تحميل تقييمات العملاء…",
    error: "تعذر تحميل تقييمات العملاء.",
    denied: "تقييمات العملاء غير متاحة ضمن نطاق الصلاحية الحالي.",
    retry: "إعادة المحاولة",
    cohort: "تُحدد الفترة بتاريخ اكتمال الزيارة المحلي للموقع، وليس بتاريخ إرسال التقييم.",
  },
} as const;

export function customerFeedbackCopy(locale: DashboardLocale) {
  return copy[locale];
}

export function feedbackNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function feedbackDate(iso: string, locationTimezone: string, locale: DashboardLocale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: locationTimezone,
  }).format(new Date(iso));
}
