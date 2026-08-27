import type { Locale } from "../../i18n/locale";

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar" : "en";
}

/**
 * Localized timestamp rendering for list/detail surfaces. Timestamps arrive as
 * backend ISO-8601 strings and are formatted at render time in the active
 * locale; invalid input renders as an em dash instead of "Invalid Date".
 */
export function formatTimestamp(
  iso: string,
  locale: Locale,
  timeZone: string | null | undefined,
): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime()) || timeZone === null || timeZone === undefined) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      ...DATE_TIME_OPTIONS,
      timeZone,
    }).format(parsed);
  } catch {
    return "—";
  }
}
