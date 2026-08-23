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

export function presentLiveError(
  error: unknown,
  locale: EmployeeLocale,
  t: EmployeeDictionary,
): string {
  if (locale === "ar") return t.operationFailed;
  return error instanceof Error ? error.message : t.operationFailed;
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
