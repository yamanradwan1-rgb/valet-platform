import {
  auditInvestigationSearchQuerySchema,
  type AuditInvestigationSearchQuery,
} from "@valet/contracts";

import type { InvestigationDemoQuery } from "./investigation-demo-types";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** This review design's displayed event timezone is Asia/Amman (UTC+03:00).
 * Do not reinterpret the browser's timezone, nor convert the to boundary to an
 * inclusive second. Historical filtering is event occurredAt in [from,to).
 */
export function ammanDateToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function localInstant(date: string, time: string): string {
  if (!datePattern.test(date) || !timePattern.test(time)) throw new Error("INVALID_TIME_WINDOW");
  const parsed = new Date(`${date}T${time}:00+03:00`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("INVALID_TIME_WINDOW");
  const local = new Date(parsed.getTime() + 3 * 60 * 60_000)
    .toISOString().slice(0, 16);
  if (local !== `${date}T${time}`) throw new Error("INVALID_TIME_WINDOW");
  return parsed.toISOString();
}

export function createLiveInvestigationDraft(locationId: string, now = new Date()): InvestigationDemoQuery {
  return {
    location: locationId,
    date: ammanDateToday(now),
    start: "00:00",
    end: "23:59",
    slot: "",
    employee: "",
    make: "",
    model: "",
    plate: "",
    sessionId: "",
  };
}

export function buildLiveInvestigationQuery(
  draft: InvestigationDemoQuery,
  scopeLocationId: string,
  selectors: { readonly keySlotId?: string; readonly membershipId?: string },
): AuditInvestigationSearchQuery {
  if (draft.location !== scopeLocationId || draft.start >= draft.end) {
    throw new Error("INVALID_INVESTIGATION_SCOPE_OR_WINDOW");
  }
  const candidate = {
    from: localInstant(draft.date, draft.start),
    to: localInstant(draft.date, draft.end),
    limit: 100,
    ...(selectors.keySlotId ? { keySlotId: selectors.keySlotId } : {}),
    ...(selectors.membershipId ? { membershipId: selectors.membershipId } : {}),
    ...(draft.make.trim() ? { make: draft.make.trim() } : {}),
    ...(draft.model.trim() ? { model: draft.model.trim() } : {}),
    ...(draft.plate.trim() ? { plate: draft.plate.trim() } : {}),
    ...(draft.sessionId.trim() ? { sessionId: draft.sessionId.trim() } : {}),
  };
  return auditInvestigationSearchQuerySchema.parse(candidate);
}
