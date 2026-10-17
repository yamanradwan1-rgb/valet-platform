import {
  auditInvestigationDetailParamsSchema,
  auditInvestigationEventDetailSchema,
  auditInvestigationTimelineQuerySchema,
  auditInvestigationTimelineResponseSchema,
  auditInvestigationUuidSchema,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import type { TimelineScopeIdentity } from "./timeline-model";

type ReadClient = Pick<DashboardApiClient, "request">;

function sessionPath(identity: TimelineScopeIdentity) {
  // These are routing identifiers only; API W4 must reauthorize on *every* GET.
  const organization = auditInvestigationUuidSchema.parse(identity.organizationId);
  const location = auditInvestigationUuidSchema.parse(identity.locationId);
  const session = auditInvestigationUuidSchema.parse(identity.sessionId);
  return (
    "/v1/staff/management/organizations/" + encodeURIComponent(organization) +
    "/locations/" + encodeURIComponent(location) +
    "/audit-investigations/sessions/" + encodeURIComponent(session)
  );
}

export function readInvestigationTimeline(
  api: ReadClient,
  identity: TimelineScopeIdentity,
  cursor: string | null,
  signal: AbortSignal,
  onAuthReconciled?: () => void,
) {
  const query = auditInvestigationTimelineQuerySchema.parse({
    limit: 100,
    ...(cursor === null ? {} : { cursor }),
  });
  return api.request(
    sessionPath(identity) + "/timeline",
    auditInvestigationTimelineResponseSchema,
    { query, signal, ...(onAuthReconciled ? { onAuthReconciled } : {}) },
  );
}

/** Separate, reauthorized point-read. Never interpret the event key as a token. */
export async function readInvestigationEventDetail(
  api: ReadClient,
  identity: TimelineScopeIdentity,
  source: string,
  eventId: string,
  signal: AbortSignal,
  onAuthReconciled?: () => void,
) {
  const params = auditInvestigationDetailParamsSchema.parse({
    sessionId: identity.sessionId,
    source,
    eventId,
  });
  const detail = await api.request(
    sessionPath(identity) + "/events/" +
      encodeURIComponent(params.source) + "/" + encodeURIComponent(params.eventId),
    auditInvestigationEventDetailSchema,
    { signal, ...(onAuthReconciled ? { onAuthReconciled } : {}) },
  );
  if (
    detail.sessionId !== params.sessionId ||
    detail.source !== params.source ||
    detail.key.source !== params.source ||
    detail.key.eventId !== params.eventId
  ) {
    throw new Error("INVALID_INVESTIGATION_DETAIL_IDENTITY");
  }
  return detail;
}
