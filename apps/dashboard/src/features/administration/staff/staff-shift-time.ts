export function historyDateRange(from: string, to: string, timezone: string) {
  try {
    const start = from ? midnight(from, timezone) : undefined;
    const end = to ? midnight(to, timezone) : undefined;
    if (start && end && start >= end) return { valid: false } as const;
    return { from: start, to: end, valid: true } as const;
  } catch {
    return { valid: false } as const;
  }
}

/** Resolve civil midnight from possible zone offsets; reject missing/ambiguous boundaries. */
function midnight(date: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error();
  const nominal = Date.parse(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(nominal) ||
    new Date(nominal).toISOString().slice(0, 10) !== date
  )
    throw new Error();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  function civil(instant: number) {
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    return Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
  }
  const offsets = new Set<number>();
  for (let hour = -36; hour <= 36; hour += 6) {
    const probe = nominal + hour * 3_600_000;
    offsets.add(civil(probe) - probe);
  }
  const matches = [...offsets]
    .map((offset) => nominal - offset)
    .filter((candidate) => civil(candidate) === nominal);
  if (matches.length !== 1) throw new Error();
  return new Date(matches[0]!).toISOString();
}

export function shiftDuration(
  row: { startedAt: string; endedAt: string | null },
  now: number,
  locale: "en" | "ar",
): string {
  const elapsed =
    (row.endedAt === null ? now : Date.parse(row.endedAt)) -
    Date.parse(row.startedAt);
  if (!Number.isFinite(elapsed)) return "—";
  const minutes = Math.floor(Math.max(0, elapsed) / 60_000);
  const hours = Math.floor(minutes / 60);
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-GB");
  const minute = `${number.format(minutes % 60)}${locale === "ar" ? " د" : "m"}`;
  return hours
    ? `${number.format(hours)}${locale === "ar" ? " س" : "h"} ${minute}`
    : minute;
}
