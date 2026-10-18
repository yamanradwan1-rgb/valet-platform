const strictDate = /^\d{4}-\d{2}-\d{2}$/;
const strictMinute = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function requireLocationZone(zone: string): Intl.DateTimeFormat {
  try {
    if (!zone || zone.trim() !== zone) throw new Error("INVALID_LOCATION_TIMEZONE");
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, hourCycle: "h23", year: "numeric",
      month: "2-digit", day: "2-digit", hour: "2-digit",
      minute: "2-digit", second: "2-digit",
    });
  } catch {
    throw new Error("INVALID_LOCATION_TIMEZONE");
  }
}

function partsAt(formatter: Intl.DateTimeFormat, instant: number) {
  const parts = formatter.formatToParts(new Date(instant));
  const field = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "";
  const local = `${field("year")}-${field("month")}-${field("day")}T${field("hour")}:${field("minute")}`;
  const equivalentUtc = Date.UTC(Number(field("year")), Number(field("month")) - 1,
    Number(field("day")), Number(field("hour")), Number(field("minute")),
    Number(field("second")));
  return { local, equivalentUtc };
}

export function dateInLocationZone(zone: string, now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_TIME_WINDOW");
  return partsAt(requireLocationZone(zone), now.getTime()).local.slice(0, 10);
}

export interface InvestigationTimeOccurrence {
  readonly utc: string;
  readonly offset: string;
}

/** Enumerate genuine instants in a persisted Location zone, including both
 * sides of a DST fold. Browser timezone never influences candidate selection. */
export function investigationMinuteCandidates(date: string, time: string,
  zone: string): readonly InvestigationTimeOccurrence[] {
  if (!strictDate.test(date) || !strictMinute.test(time))
    throw new Error("INVALID_TIME_WINDOW");
  const naive = new Date(`${date}T${time}:00.000Z`);
  if (!Number.isFinite(naive.getTime()) ||
      naive.toISOString().slice(0, 16) !== `${date}T${time}`)
    throw new Error("INVALID_TIME_WINDOW");
  const formatter = requireLocationZone(zone);
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sampled = naive.getTime() + hours * 60 * 60_000;
    offsets.add(partsAt(formatter, sampled).equivalentUtc - sampled);
  }
  const matches = new Set<number>();
  for (const offset of offsets) {
    const candidate = naive.getTime() - offset;
    if (partsAt(formatter, candidate).local === `${date}T${time}`)
      matches.add(candidate);
  }
  if (matches.size === 0) throw new Error("NONEXISTENT_LOCAL_TIME");
  return [...matches].sort((a, b) => a - b).map((candidate) => {
    const minutes = Math.round((naive.getTime() - candidate) / 60_000);
    const sign = minutes < 0 ? "-" : "+";
    const absolute = Math.abs(minutes);
    return {
      utc: new Date(candidate).toISOString(),
      offset: `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`,
    };
  });
}

/** Explicit UTC choice is mandatory for folds; gaps always fail closed. */
export function investigationMinuteToUtc(date: string, time: string,
  zone: string, chosen?: string): string {
  const candidates = investigationMinuteCandidates(date, time, zone);
  if (chosen) {
    if (candidates.some((candidate) => candidate.utc === chosen)) return chosen;
    throw new Error("INVALID_TIME_OCCURRENCE");
  }
  if (candidates.length !== 1) throw new Error("AMBIGUOUS_LOCAL_TIME_REQUIRES_OFFSET");
  return candidates[0]!.utc;
}
