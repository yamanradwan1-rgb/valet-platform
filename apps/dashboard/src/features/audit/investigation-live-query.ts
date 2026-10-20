import {
  auditInvestigationSearchQuerySchema,
  type AuditInvestigationSearchQuery,
} from "@valet/contracts";

import type { InvestigationDemoQuery } from "./investigation-demo-types";
import { dateInLocationZone, investigationMinuteToUtc } from "./investigation-live-timezone";

export function ammanDateToday(now = new Date()): string {
  return dateInLocationZone("Asia/Amman", now);
}

export function createLiveInvestigationDraft(locationId: string, now = new Date(),
  locationTimezone = "Asia/Amman"): InvestigationDemoQuery {
  return {
    location: locationId,
    date: dateInLocationZone(locationTimezone, now),
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
  locationTimezone = "Asia/Amman",
): AuditInvestigationSearchQuery {
  if (draft.location !== scopeLocationId) {
    throw new Error("INVALID_INVESTIGATION_SCOPE_OR_WINDOW");
  }
  const candidate = {
    from: investigationMinuteToUtc(draft.date, draft.start, locationTimezone, draft.fromUtc),
    to: investigationMinuteToUtc(draft.date, draft.end, locationTimezone, draft.toUtc),
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
