import type { DashboardLocale } from "../../lib/i18n/locale";

/** History supplies an instant, not a Location timezone. Never infer one. */
export function formatVisitContactTime(value: string, locale: DashboardLocale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
