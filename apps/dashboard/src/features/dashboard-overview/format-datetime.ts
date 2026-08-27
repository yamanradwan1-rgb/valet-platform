export type SupportedFormatLocale = "en" | "ar";

/**
 * Locale-aware short timestamp rendering ("Aug 24, 07:00" style).
 *
 * Contract timestamps are ISO with offset; anything unparseable is echoed
 * back verbatim rather than being replaced by invented text.
 */
export function formatTimestamp(
  isoTimestamp: string,
  locale: SupportedFormatLocale,
  timeZone: string | null | undefined,
): string {
  const instant = Date.parse(isoTimestamp);
  if (Number.isNaN(instant) || timeZone === null || timeZone === undefined) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(instant);
  } catch {
    return "—";
  }
}
