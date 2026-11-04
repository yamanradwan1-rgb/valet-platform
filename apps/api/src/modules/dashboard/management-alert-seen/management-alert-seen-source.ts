import type { PostgresTransaction } from "../../../common/database/postgres";
import { ManagementAccessDeniedError } from "../../management/management-authorization";

/** Only source identities with proven, immutable committed receipts are enabled. */
export type SeenOccurrenceCategory = "ALT-05" | "ALT-07" | "ALT-09" | "ALT-13" | "ALT-15";

interface SourceTimeRow {
  readonly occurredAt: Date;
}

const sourceSql: Record<SeenOccurrenceCategory, string> = {
  "ALT-05": `SELECT takeover.occurred_at AS "occurredAt"
    FROM emergency_task_takeover_operations AS takeover
    INNER JOIN dispatch_events AS dispatch
      ON dispatch.organization_id = takeover.organization_id
     AND dispatch.id = takeover.dispatch_event_id
     AND dispatch.location_id = takeover.location_id
     AND dispatch.task_id = takeover.task_id
     AND dispatch.valet_session_id = takeover.valet_session_id
     AND dispatch.event_type = 'EMERGENCY_TAKEOVER'
     AND dispatch.occurred_at = takeover.occurred_at
    INNER JOIN audit_events AS audit
      ON audit.organization_id = takeover.organization_id
     AND audit.id = takeover.audit_event_id
     AND audit.location_id = takeover.location_id
     AND audit.valet_session_id = takeover.valet_session_id
     AND audit.event_type = 'TASK_EMERGENCY_TAKEOVER'
     AND audit.entity_type = 'Task' AND audit.entity_id = takeover.task_id
     AND audit.occurred_at = takeover.occurred_at
    INNER JOIN locations AS location
      ON location.organization_id = takeover.organization_id
     AND location.id = takeover.location_id AND location.status = 'ACTIVE'
    WHERE takeover.organization_id = $1 AND takeover.location_id = $2
      AND takeover.operation_id = $3 AND takeover.operation_id = $4`,
  "ALT-07": `SELECT event.occurred_at AS "occurredAt"
    FROM audit_events AS event
    INNER JOIN valet_sessions AS session
      ON session.id = event.valet_session_id
      AND session.organization_id = event.organization_id
      AND session.location_id = event.location_id
    WHERE event.organization_id = $1 AND event.location_id = $2
      AND event.id = $3 AND event.id = $4
      AND event.entity_type = 'ValetSession'
      AND event.entity_id = event.valet_session_id
      AND event.actor_type = 'MEMBERSHIP'
      AND ((event.event_type = 'HANDOFF_VERIFICATION_FAILED'
         AND event.metadata_json @> '{"terminalized":true}'::jsonb)
        OR event.event_type = 'HANDOFF_SUPERVISOR_OVERRIDE')`,
  "ALT-09": `SELECT event.recorded_at AS "occurredAt"
    FROM geofence_events AS event
    INNER JOIN task_tracking_sessions AS tracker
      ON tracker.organization_id = event.organization_id
     AND tracker.location_id = event.location_id
     AND tracker.valet_session_id = event.valet_session_id
     AND tracker.task_id = event.task_id
     AND tracker.id = event.tracking_session_id
    INNER JOIN tasks AS task
      ON task.organization_id = event.organization_id
     AND task.location_id = event.location_id
     AND task.valet_session_id = event.valet_session_id
     AND task.id = event.task_id
     AND task.task_type IN ('PARKING','RETRIEVAL')
    INNER JOIN valet_sessions AS session
      ON session.organization_id = event.organization_id
     AND session.location_id = event.location_id
     AND session.id = event.valet_session_id
    INNER JOIN location_map_areas AS area
      ON area.organization_id = event.organization_id
     AND area.location_id = event.location_id
     AND area.id = event.map_area_id
    JOIN LATERAL (
      SELECT count(*) FILTER (WHERE peer.event_type = 'VIOLATION')::int
               AS violation_count,
             count(*) FILTER (WHERE peer.event_type = 'ENTERED')::int
               AS entered_count,
             count(*) FILTER (WHERE peer.event_type = 'EXITED')::int
               AS exited_count
      FROM geofence_events AS peer
      WHERE peer.organization_id = event.organization_id
        AND peer.location_id = event.location_id
        AND peer.valet_session_id = event.valet_session_id
        AND peer.task_id = event.task_id
        AND peer.tracking_session_id = event.tracking_session_id
        AND peer.map_area_id = event.map_area_id
        AND peer.occurred_at = event.occurred_at
    ) AS peers ON peers.violation_count = 1
      AND ((peers.entered_count = 1 AND peers.exited_count = 0)
        OR (peers.entered_count = 0 AND peers.exited_count = 1))
    WHERE event.organization_id = $1 AND event.location_id = $2
      AND event.id = $3 AND event.id = $4
      AND event.event_type = 'VIOLATION'
      AND event.occurred_at >= tracker.started_at
      AND event.occurred_at <= event.recorded_at + INTERVAL '30 seconds'`,
  "ALT-13": `SELECT audit.occurred_at AS "occurredAt"
    FROM audit_events AS audit
    INNER JOIN shifts AS shift_row
      ON shift_row.organization_id = audit.organization_id
     AND shift_row.id = audit.entity_id AND shift_row.status = 'ENDED'
    INNER JOIN locations AS location
      ON location.organization_id = shift_row.organization_id
     AND location.id = shift_row.location_id AND location.status = 'ACTIVE'
    WHERE audit.organization_id = $1 AND audit.location_id = $2
      AND audit.entity_id = $3 AND audit.id = $4
      AND audit.event_type = 'SHIFT_FORCE_ENDED' AND audit.entity_type = 'Shift'
      AND audit.metadata_json->>'closureKind' = 'ADMIN_FORCE_END'
      AND audit.metadata_json ? 'operationId'`,
  "ALT-15": `SELECT audit.occurred_at AS "occurredAt"
    FROM audit_events AS audit
    WHERE audit.organization_id = $1 AND audit.location_id IS NULL
      AND EXISTS (SELECT 1 FROM locations AS chosen
        WHERE chosen.id = $2 AND chosen.organization_id = audit.organization_id
          AND chosen.status = 'ACTIVE')
      AND audit.entity_type = 'OrganizationMembership'
      AND audit.entity_id = $3 AND audit.id = $4
      AND audit.event_type IN (
        'STAFF_ROLE_CHANGED','STAFF_LOCATION_ACCESS_REVOKED'
      )
      AND (
        (audit.event_type = 'STAFF_ROLE_CHANGED'
          AND audit.metadata_json->>'previousRole' IS DISTINCT FROM audit.metadata_json->>'newRole'
          AND audit.metadata_json ? 'previousRole'
          AND audit.metadata_json ? 'newRole')
        OR (audit.event_type = 'STAFF_LOCATION_ACCESS_REVOKED'
          AND length(audit.metadata_json->>'locationCount') BETWEEN 1 AND 10
          AND (audit.metadata_json->>'locationCount') ~ '^[0-9]+$'
          AND (audit.metadata_json->>'locationCount')::numeric > 0)
      )`,
};

/** Called only after exact recipient + source-category authorization. */
export async function readCommittedSeenSourceTime(
  transaction: PostgresTransaction,
  input: {
    readonly organizationId: string;
    readonly locationId: string;
    readonly category: SeenOccurrenceCategory;
    readonly sourceId: string;
    readonly episodeId: string;
  },
): Promise<Date> {
  const source = await transaction.query<SourceTimeRow>(sourceSql[input.category], [
    input.organizationId,
    input.locationId,
    input.sourceId,
    input.episodeId,
  ]);
  const occurredAt = source.rows[0]?.occurredAt;
  if (source.rowCount !== 1 || !(occurredAt instanceof Date)) {
    throw new ManagementAccessDeniedError();
  }
  return occurredAt;
}
