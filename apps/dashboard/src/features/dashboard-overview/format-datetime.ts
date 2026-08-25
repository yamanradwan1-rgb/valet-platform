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
  timeZone?: string | undefined,
): string {
  const instant = Date.parse(isoTimestamp);
  if (Number.isNaN(instant)) return isoTimestamp;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone === undefined ? {} : { timeZone }),
  });
  return formatter.format(instant);
}
