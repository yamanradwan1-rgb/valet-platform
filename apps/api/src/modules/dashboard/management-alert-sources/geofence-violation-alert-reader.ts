import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  requireManagementAlertSourceId,
  type ManagementAlertExactReaderInput,
  type ManagementAlertReaderInput,
} from "./management-alert-source-contract";
import { requireGeofenceSummaryScope } from "./geofence-summary-authority";

interface ViolationRow {
  readonly eventId: string;
  readonly taskId: string;
  readonly valetSessionId: string;
  readonly trackingSessionId: string;
  readonly mapAreaId: string;
  readonly capturedAt: Date;
  readonly recordedAt: Date;
  readonly enteredCount: number;
  readonly exitedCount: number;
}

export interface GeofenceViolationAlertCase {
  readonly category: "ALT-09";
  readonly severity: "CRITICAL";
  /** Each committed violation is distinct; no unproven repeat coalescing. */
  readonly sourceId: string;
  readonly episodeId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly taskId: string;
  readonly valetSessionId: string;
  readonly trackingSessionId: string;
  readonly mapAreaId: string;
  readonly subtype: "RESTRICTED_ENTRY" | "LEFT_ALLOWED_UNION";
  /** DB-written attention clock, not GPS-device time or a commit-order proof. */
  readonly attentionAt: string;
  readonly capturedAt: string;
  readonly title: "Geofence violation recorded";
}

/** Safe, source-proven subtype only; the current area purpose may have changed. */
export function projectGeofenceViolationRow(
  row: ViolationRow,
  scope: { readonly organizationId: string; readonly locationId: string },
): GeofenceViolationAlertCase | null {
  if (
    !(row.capturedAt instanceof Date) ||
    !Number.isFinite(row.capturedAt.getTime()) ||
    !(row.recordedAt instanceof Date) ||
    !Number.isFinite(row.recordedAt.getTime())
  ) {
    return null;
  }
  const subtype =
    row.enteredCount === 1 && row.exitedCount === 0
      ? "RESTRICTED_ENTRY"
      : row.enteredCount === 0 && row.exitedCount === 1
        ? "LEFT_ALLOWED_UNION"
        : null;
  if (subtype === null) return null;
  return {
    category: "ALT-09",
    severity: "CRITICAL",
    sourceId: row.eventId,
    episodeId: row.eventId,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    taskId: row.taskId,
    valetSessionId: row.valetSessionId,
    trackingSessionId: row.trackingSessionId,
    mapAreaId: row.mapAreaId,
    subtype,
    attentionAt: row.recordedAt.toISOString(),
    capturedAt: row.capturedAt.toISOString(),
    title: "Geofence violation recorded",
  };
}

async function readViolations(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
  sourceId?: string,
): Promise<GeofenceViolationAlertCase[]> {
  // Authorization precedes every event row, subtype proof, count and LIMIT.
  const scope = await requireGeofenceSummaryScope(transaction, input);
  const exact = sourceId === undefined ? "" : "AND event.id = $4::uuid";
  // A Seen receipt affects only a recipient's pending list. The source still
  // exists and exact navigation/Seen retries must reauthorize it independently.
  const unseen =
    sourceId === undefined
      ? `AND NOT EXISTS (
           SELECT 1 FROM management_alert_seen_receipts AS seen
           WHERE seen.organization_id = event.organization_id
             AND seen.user_id = $4::uuid
             AND seen.category = 'ALT-09'
             AND seen.source_id = event.id
             AND seen.geofence_event_id = event.id
         )`
      : "";
  const result = await transaction.query<ViolationRow>(
    `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
     SELECT event.id::text AS "eventId", event.task_id::text AS "taskId",
            event.valet_session_id::text AS "valetSessionId",
            event.tracking_session_id::text AS "trackingSessionId",
            event.map_area_id::text AS "mapAreaId",
            event.occurred_at AS "capturedAt", event.recorded_at AS "recordedAt",
            peers.entered_count AS "enteredCount",
            peers.exited_count AS "exitedCount"
     FROM geofence_events AS event
     JOIN task_tracking_sessions AS tracker
       ON tracker.organization_id = event.organization_id
      AND tracker.location_id = event.location_id
      AND tracker.valet_session_id = event.valet_session_id
      AND tracker.task_id = event.task_id
      AND tracker.id = event.tracking_session_id
     JOIN tasks AS task
       ON task.organization_id = event.organization_id
      AND task.location_id = event.location_id
      AND task.valet_session_id = event.valet_session_id
      AND task.id = event.task_id
      AND task.task_type IN ('PARKING', 'RETRIEVAL')
     JOIN valet_sessions AS session
       ON session.organization_id = event.organization_id
      AND session.location_id = event.location_id
      AND session.id = event.valet_session_id
     JOIN location_map_areas AS area
       ON area.organization_id = event.organization_id
      AND area.location_id = event.location_id
      AND area.id = event.map_area_id
     CROSS JOIN instant
     JOIN LATERAL (
       SELECT count(*)::int AS peer_count,
              count(*) FILTER (WHERE peer.event_type = 'VIOLATION')::int
                AS violation_count,
              count(*) FILTER (WHERE peer.event_type = 'ENTERED')::int
                AS entered_count,
              count(*) FILTER (WHERE peer.event_type = 'EXITED')::int
                AS exited_count
       FROM (
         -- Two source rows (one transition, one violation) prove the subtype.
         -- Any third same-area/same-captured-ms row makes attribution ambiguous.
         -- Existing area/occurred_at and tracker/occurred_at indexes can narrow
         -- the probe; LIMIT 3 prevents counting arbitrarily many tied peers.
         SELECT candidate.event_type
         FROM geofence_events AS candidate
         WHERE candidate.tracking_session_id = event.tracking_session_id
           AND candidate.occurred_at = event.occurred_at
           AND candidate.organization_id = event.organization_id
           AND candidate.location_id = event.location_id
           AND candidate.valet_session_id = event.valet_session_id
           AND candidate.task_id = event.task_id
           AND candidate.map_area_id = event.map_area_id
         LIMIT 3
       ) AS peer
     ) AS peers ON peers.peer_count = 2 AND peers.violation_count = 1
       AND ((peers.entered_count = 1 AND peers.exited_count = 0)
         OR (peers.entered_count = 0 AND peers.exited_count = 1))
     WHERE event.organization_id = $1 AND event.location_id = $2
       AND event.event_type = 'VIOLATION'
       AND event.recorded_at >= instant.at - INTERVAL '7 days'
       AND event.recorded_at <= instant.at
       AND event.occurred_at >= tracker.started_at
       AND event.occurred_at <= event.recorded_at + INTERVAL '30 seconds'
       ${unseen}
       ${exact}
     ORDER BY event.recorded_at DESC, event.id DESC
     LIMIT $3`,
    [
      scope.organizationId,
      scope.locationId,
      input.limit,
      sourceId ?? input.context.userId,
    ],
  );
  return result.rows.flatMap((row) => {
    const projected = projectGeofenceViolationRow(row, scope);
    return projected === null ? [] : [projected];
  });
}

/** OD-07B: no guess that a historical violation means currently out of bounds. */
export async function queryGeofenceViolationAlertCases(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<GeofenceViolationAlertCase[]> {
  return readViolations(transaction, input);
}

/** A future Seen writer must call this inside its own authorized transaction. */
export async function findGeofenceViolationAlertCaseById(
  transaction: PostgresTransaction,
  input: ManagementAlertExactReaderInput,
): Promise<GeofenceViolationAlertCase | null> {
  requireManagementAlertSourceId(input.sourceId);
  return (
    (
      await readViolations(
        transaction,
        { context: input.context, scope: input.scope, limit: 1 },
        input.sourceId,
      )
    )[0] ?? null
  );
}
