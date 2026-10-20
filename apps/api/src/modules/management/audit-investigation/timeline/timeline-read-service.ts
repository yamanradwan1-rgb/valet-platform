import {
  auditInvestigationDetailParamsSchema,
  auditInvestigationEventDetailSchema,
  auditInvestigationTimelineQuerySchema,
  auditInvestigationTimelineResponseSchema,
  type AuditInvestigationEventDetail,
  type AuditInvestigationTimelineQuery,
  type AuditInvestigationTimelineResponse,
} from "@valet/contracts";
import { ServiceUnavailableException } from "@nestjs/common";
import type { PostgresTransaction } from "../../../../common/database/postgres";
import { recordAdminActivityInTransaction } from "../../../auth/mfa/mfa-assurance-policy";
import { captureManagementPaginationSnapshot } from "../../management-pagination-snapshot";
import { bindInvestigationCursor, decodeInvestigationCursor,
  encodeInvestigationCursor, type InvestigationCursorBinding } from "../audit-investigation-cursor";
import { requireU05StableIndirectCohort } from "../audit-investigation-u05-indirect-guard";
import { readU05IncidentPolicy } from "../audit-investigation-u05-policy";
import type { StaffSessionContext } from "../../../auth/staff-session-context";
import { ManagementAccessDeniedError } from "../../management-authorization";
import {
  authorizeAuditInvestigationLocation,
  type AuditInvestigationLocationAuthorization,
} from "../security/audit-investigation-authorization";
import { requireAuditInvestigationDetailSource } from "../security/audit-investigation-source-boundary";
import { hasAnchoredTimelineAuditAnomaly,
  requireIndirectAuditSessionContainment } from "./timeline-indirect-audit";
import {
  projectTimelineDetail,
  projectTimelineRow,
} from "./timeline-safe-projection";
import { readTimelineSession } from "./timeline-session-query";
import {
  readTimelineSources,
  type TimelineSourceRow,
} from "./timeline-source-query";

/** U05: missing three birth-XID columns makes a stable cross-request source
 * cohort impossible to prove. Never encode a timestamp-only continuation. */
export class TimelinePaginationNotProvenError extends ServiceUnavailableException {
  readonly code = "AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE" as const;

  constructor() {
    super({
      code: "AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE",
      message: "Timeline pagination temporarily unavailable.",
    });
  }
}

const available = { status: "AVAILABLE" as const };

export function assertOrderedDistinct(rows: readonly TimelineSourceRow[]) {
  const seen = new Set<string>();
  const rank = { AUDIT: 0, KEY_CUSTODY: 1, DISPATCH: 2, INCIDENT: 3 };
  let prior: [string, number, string] | null = null;
  for (const row of rows) {
    const key = row.source + ":" + row.id.toLowerCase();
    if (seen.has(key)) throw new Error("Duplicate persisted source identity.");
    seen.add(key);
    const stamp = row.occurredAtCursor;
    const order: [string, number, string] = [
      stamp,
      rank[row.source],
      row.id.toLowerCase(),
    ];
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(stamp) ||
      (prior !== null &&
        (order[0] < prior[0] ||
          (order[0] === prior[0] && order[1] < prior[1]) ||
          (order[0] === prior[0] &&
            order[1] === prior[1] &&
            order[2] <= prior[2])))
    ) {
      throw new Error("Timeline source order is inconsistent.");
    }
    prior = order;
  }
}

/** Internal seam for an already reauthorized W4 scope in the same transaction.
 * Reads all available sources, not only discovery-window events. */
export async function readAuditInvestigationTimeline(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  sessionId: string,
  input: AuditInvestigationTimelineQuery,
  binding?: InvestigationCursorBinding,
): Promise<AuditInvestigationTimelineResponse> {
  const query = auditInvestigationTimelineQuerySchema.parse(input);
  if (query.cursor && !binding) throw new TimelinePaginationNotProvenError();
  const decoded = binding ? decodeInvestigationCursor(query.cursor, binding) : null;
  const captured = decoded === null
    ? await captureManagementPaginationSnapshot(tx)
    : { now: new Date(decoded.snapshotAt),
        cutoff: decoded.snapshotCutoff, snapshot: decoded.databaseSnapshot };
  const session = await readTimelineSession(tx, scope, sessionId, captured.snapshot);
  // DEC-059: Incident visibility depends on the Location's CURRENT active
  // state, even when the other three historical sources remain readable.
  const currentLocation = await tx.query<{ readonly status: string }>(
    `SELECT status FROM locations
      WHERE organization_id = $1::uuid AND id = $2::uuid`,
    [scope.organizationId, scope.locationId],
  );
  const incidentAvailable = currentLocation.rows[0]?.status === "ACTIVE";
  const rows = await readTimelineSources(tx, scope, sessionId, query.limit + 1,
    undefined, { cutoff: captured.cutoff, database: captured.snapshot,
      ...(decoded?.purpose === "SESSION_TIMELINE" ? { last: decoded.last } : {}) });
  assertOrderedDistinct(rows);
  const hasMore = rows.length > query.limit;
  if (hasMore && !binding)
    throw new TimelinePaginationNotProvenError();
  if (hasMore && captured.snapshot.length > 512)
    throw new TimelinePaginationNotProvenError();
  // Always apply the conservative database-owned indirect cohort check for
  // production pagination; never require a synthetic Owner proof lease for
  // otherwise safely bounded, independently authorized ordinary reads.
  if (binding && (hasMore || query.cursor)) {
    try {
      await requireU05StableIndirectCohort(tx, scope,
        { cutoff: captured.cutoff, database: captured.snapshot });
    } catch {
      throw new TimelinePaginationNotProvenError();
    }
  }
  const page = rows.slice(0, query.limit);
  const auditAnomaly = await hasAnchoredTimelineAuditAnomaly(tx, scope,
    sessionId, { database: captured.snapshot, cutoff: captured.cutoff });
  const last = page.at(-1);
  const rank = { AUDIT: 0, KEY_CUSTODY: 1, DISPATCH: 2, INCIDENT: 3 };
  const issuedAt = decoded?.issuedAt ?? new Date().toISOString();
  const expiresAt = decoded?.expiresAt ??
    new Date(Date.parse(issuedAt) + 15 * 60_000).toISOString();
  const nextCursor = hasMore && binding && last
    ? encodeInvestigationCursor(binding, {
        version: 1, purpose: "SESSION_TIMELINE", sessionId,
        organizationId: binding.organizationId, locationId: binding.locationId,
        viewerSessionDigest: binding.viewerSessionDigest,
        filterDigest: binding.filterDigest,
        snapshotAt: captured.now.toISOString(), databaseSnapshot: captured.snapshot,
        snapshotCutoff: captured.cutoff,
        issuedAt, expiresAt,
        last: { occurredAt: last.occurredAtCursor,
          sourceRank: rank[last.source], eventId: last.id },
      }) : null;
  return auditInvestigationTimelineResponseSchema.parse({
    session,
    items: page.map((row) => projectTimelineRow(row, sessionId)),
    nextCursor,
    snapshotAt: captured.now.toISOString(),
    order: "ASC",
    coverage: {
      AUDIT: auditAnomaly
        ? { status: "PARTIAL", reason: "INTEGRITY_ANOMALY" } : available,
      KEY_CUSTODY: available,
      DISPATCH: available,
      INCIDENT: incidentAvailable ? available : {
        status: "NOT_AUTHORIZED",
        reason: "DETAIL_RESTRICTED",
      },
    },
  });
}

/** Requires the exact currently authenticated staff session, grant, MFA,
 * commercial access, and persisted Location before reading sources. */
export async function readAuthorizedAuditInvestigationTimeline(
  tx: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locationId: string,
  sessionId: string,
  query: AuditInvestigationTimelineQuery,
): Promise<AuditInvestigationTimelineResponse> {
  const scope = await authorizeAuditInvestigationLocation(
    tx,
    context,
    organizationId,
    locationId,
  );
  const binding = bindInvestigationCursor({
    context, scope, purpose: "SESSION_TIMELINE", sessionId,
    normalizedFilters: {
      incidentPolicy: await readU05IncidentPolicy(tx, scope),
    },
  });
  const response = await readAuditInvestigationTimeline(
    tx,
    scope,
    sessionId,
    query, binding,
  );
  if (scope.role === "ORG_ADMIN") {
    await recordAdminActivityInTransaction(tx, context);
  }
  return response;
}

/** W4 validates the direct source first. Indirect Audit is allowed only after
 * independently proving a NULL-direct canonical Session/Task/Incident link
 * under this SAME presently authorized scope and database transaction. */
export async function readAuditInvestigationEventDetail(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  sessionId: string,
  source: TimelineSourceRow["source"],
  eventId: string,
): Promise<AuditInvestigationEventDetail> {
  const params = auditInvestigationDetailParamsSchema.parse({
    sessionId,
    source,
    eventId,
  });
  await readTimelineSession(tx, scope, params.sessionId);
  try {
    await requireAuditInvestigationDetailSource(tx, scope, params);
  } catch (error) {
    if (
      params.source !== "AUDIT" ||
      !(error instanceof ManagementAccessDeniedError)
    ) {
      throw error;
    }
    await requireIndirectAuditSessionContainment(
      tx,
      scope,
      params.sessionId,
      params.eventId,
    );
  }
  const rows = await readTimelineSources(tx, scope, sessionId, 1, {
    source: params.source,
    id: params.eventId,
  });
  if (
    rows.length !== 1 ||
    rows[0]?.id !== params.eventId ||
    rows[0]?.source !== params.source
  ) {
    throw new ManagementAccessDeniedError();
  }
  return auditInvestigationEventDetailSchema.parse(
    projectTimelineDetail(rows[0], sessionId),
  );
}

export async function readAuthorizedAuditInvestigationEventDetail(
  tx: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locationId: string,
  sessionId: string,
  source: TimelineSourceRow["source"],
  eventId: string,
): Promise<AuditInvestigationEventDetail> {
  const scope = await authorizeAuditInvestigationLocation(
    tx,
    context,
    organizationId,
    locationId,
  );
  const detail = await readAuditInvestigationEventDetail(
    tx,
    scope,
    sessionId,
    source,
    eventId,
  );
  if (scope.role === "ORG_ADMIN") {
    await recordAdminActivityInTransaction(tx, context);
  }
  return detail;
}
