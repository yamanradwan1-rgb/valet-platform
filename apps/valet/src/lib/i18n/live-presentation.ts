import type {
  EmployeeDictionary,
  EmployeeLocale,
} from "./dictionary";

export function formatEmployeeTime(
  isoString: string | undefined,
  locale: EmployeeLocale,
): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Locale-aware date+time presentation using the device timezone. */
export function formatEmployeeDateTime(
  isoString: string | null | undefined,
  locale: EmployeeLocale,
): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function presentLiveError(
  error: unknown,
  locale: EmployeeLocale,
  t: EmployeeDictionary,
): string {
  if (locale === "ar") return t.operationFailed;
  return error instanceof Error ? error.message : t.operationFailed;
}

export interface ShiftDurationUnitLabels {
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
}

const SHIFT_DURATION_UNITS: Record<
  EmployeeLocale,
  ShiftDurationUnitLabels
> = {
  ar: { day: "يوم", hour: "س", minute: "د" },
  en: { day: "d", hour: "h", minute: "m" },
};

/**
 * Human-readable Shift elapsed duration (VUI-011A UX correction):
 * under 24h -> compact hours/minutes; 24h or more -> days + hours + minutes.
 * Deterministic given elapsedSeconds so it is directly unit-testable.
 */
export function formatShiftDuration(
  elapsedSeconds: number,
  locale: EmployeeLocale,
  unitLabels?: ShiftDurationUnitLabels | undefined,
): string {
  const total = Math.max(0, Math.floor(elapsedSeconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const units = unitLabels ?? SHIFT_DURATION_UNITS[locale];
  const arabic = locale === "ar";
  const part = (value: number, suffix: string): string =>
    arabic ? `${value} ${suffix}` : `${value}${suffix}`;
  const parts: string[] = [];
  if (days > 0) parts.push(part(days, units.day));
  parts.push(part(hours, units.hour));
  parts.push(part(minutes, units.minute));
  return parts.join(" ");
}

export function presentBadge(
  badge: string,
  t: EmployeeDictionary,
): string {
  const labels: Record<string, string> = {
    active: t.activeState,
    checkin: t.checkInState,
    completed: t.completedState,
    handoff: t.handoffState,
    incident: t.incidentState,
    parked: t.parkedState,
    parking: t.parkingState,
    queued: t.queuedState,
    ready: t.readyForPickup,
    requested: t.requestedState,
    retrieval: t.retrievalState,
  };
  return labels[badge] ?? badge;
}

export function presentTaskStatus(
  status: string,
  t: EmployeeDictionary,
): string {
  const labels: Record<string, string> = {
    ACCEPTED: t.activeState,
    ASSIGNED: t.assigned,
    IN_PROGRESS: t.inProgressState,
    QUEUED: t.queuedState,
  };
  return labels[status] ?? status;
}

export function presentTaskTime(
  timestampIso: string,
  kind: "queued" | "requested",
  locale: EmployeeLocale,
  t: EmployeeDictionary,
  nowMs: number = Date.now(),
): string {
  const minutes = Math.floor(
    Math.max(0, nowMs - new Date(timestampIso).getTime()) / 60_000,
  );
  const relative = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  }).format(-minutes, "minute");
  const prefix = kind === "requested" ? t.requestedState : t.queuedState;
  return `${prefix} ${relative}`;
}
