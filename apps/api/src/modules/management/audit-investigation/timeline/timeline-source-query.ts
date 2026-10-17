import type { PostgresTransaction } from "../../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";

/** Fixed safe columns only; never select free text, metadata or credentials. */
export interface TimelineSourceRow {
  readonly source: "AUDIT" | "KEY_CUSTODY" | "DISPATCH" | "INCIDENT";
  readonly id: string;
  readonly occurredAt: Date;
  readonly recordedAt: Date;
  readonly kind: string;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly previousId: string | null;
  readonly previousName: string | null;
  readonly nextId: string | null;
  readonly nextName: string | null;
  readonly reporterId: string | null;
  readonly reporterName: string | null;
  readonly keySlotId: string | null;
  readonly taskId: string | null;
  readonly incidentType: string | null;
  readonly incidentSeverity: string | null;
  readonly incidentStatus: string | null;
}

/** One statement snapshot across all four source arms. Explicit source/event
 * identity is never coalesced with an independently persisted Audit twin. */
export const timelineSourceSql = `
WITH scoped AS MATERIALIZED (
  SELECT session.id, session.organization_id, session.location_id,
         session.vehicle_id
  FROM valet_sessions AS session
  WHERE session.organization_id = $1::uuid
    AND session.location_id = $2::uuid
    AND session.id = $3::uuid
),
evidence AS (
  SELECT 'AUDIT'::text AS source, 0 AS rank,
         audit.id, audit.occurred_at, audit.created_at,
         audit.event_type::text AS kind,
         CASE WHEN audit.actor_type IS NULL OR audit.actor_type = 'MEMBERSHIP'
              THEN audit.actor_membership_id ELSE NULL::uuid END AS actor_id,
         NULL::uuid AS previous_id, NULL::uuid AS next_id,
         NULL::uuid AS reporter_id, NULL::uuid AS key_slot_id,
         NULL::uuid AS task_id, NULL::text AS incident_type,
         NULL::text AS incident_severity, NULL::text AS incident_status
  FROM scoped AS session
  JOIN audit_events AS audit
    ON audit.organization_id = session.organization_id
   AND audit.location_id = session.location_id
  LEFT JOIN tasks AS linked_task
    ON linked_task.organization_id = session.organization_id
   AND linked_task.location_id = session.location_id
   AND linked_task.valet_session_id = session.id
   AND (
     (audit.entity_type IN ('Task', 'TASK') AND audit.entity_id = linked_task.id)
     OR (audit.entity_type NOT IN ('Task', 'TASK')
         AND audit.event_type = 'VALET_SESSION_PARKED'
         AND linked_task.task_type = 'PARKING'
         AND linked_task.id::text = audit.metadata_json->>'taskId')
   )
  LEFT JOIN incidents AS linked_incident
    ON linked_incident.organization_id = session.organization_id
   AND linked_incident.location_id = session.location_id
   AND linked_incident.valet_session_id = session.id
   AND audit.entity_type IN ('Incident', 'INCIDENT')
   AND audit.entity_id = linked_incident.id
  WHERE (
    audit.valet_session_id = session.id
    OR (audit.valet_session_id IS NULL AND (
      (audit.entity_type IN ('ValetSession', 'VALET_SESSION')
       AND audit.entity_id = session.id)
      OR (audit.entity_type IN ('Task', 'TASK') AND linked_task.id IS NOT NULL)
      OR (audit.entity_type IN ('Incident', 'INCIDENT') AND linked_incident.id IS NOT NULL)
      OR (audit.event_type = 'VALET_SESSION_PARKED'
          AND linked_task.id IS NOT NULL
          AND linked_task.task_type = 'PARKING'
          AND linked_task.id::text = audit.metadata_json->>'taskId')
    ))
  )
  AND (
    audit.entity_type NOT IN ('ValetSession', 'VALET_SESSION',
                             'Task', 'TASK', 'Incident', 'INCIDENT', 'Vehicle', 'VEHICLE')
    OR (audit.entity_type IN ('ValetSession', 'VALET_SESSION')
        AND audit.entity_id = session.id)
    OR (audit.entity_type IN ('Task', 'TASK') AND linked_task.id IS NOT NULL)
    OR (audit.entity_type IN ('Incident', 'INCIDENT') AND linked_incident.id IS NOT NULL)
    OR (audit.entity_type IN ('Vehicle', 'VEHICLE')
        AND audit.valet_session_id = session.id
        AND audit.entity_id = session.vehicle_id)
  )
  AND (audit.event_type <> 'VALET_SESSION_PARKED'
       OR audit.metadata_json->>'taskId' IS NULL
       OR linked_task.id IS NOT NULL)

  UNION ALL
  SELECT 'KEY_CUSTODY', 1, custody.id, custody.occurred_at,
         custody.created_at, custody.event_type::text,
         custody.actor_membership_id, NULL::uuid, NULL::uuid,
         NULL::uuid, custody.key_slot_id, NULL::uuid,
         NULL::text, NULL::text, NULL::text
  FROM scoped AS session
  JOIN key_custody_events AS custody
    ON custody.organization_id = session.organization_id
   AND custody.location_id = session.location_id
   AND custody.valet_session_id = session.id

  UNION ALL
  SELECT 'DISPATCH', 2, dispatch.id, dispatch.occurred_at,
         dispatch.created_at, dispatch.event_type::text,
         dispatch.actor_membership_id,
         dispatch.previous_assignee_membership_id,
         dispatch.new_assignee_membership_id, NULL::uuid,
         NULL::uuid, dispatch.task_id, NULL::text,
         NULL::text, NULL::text
  FROM scoped AS session
  JOIN dispatch_events AS dispatch
    ON dispatch.organization_id = session.organization_id
   AND dispatch.location_id = session.location_id
   AND dispatch.valet_session_id = session.id
  JOIN tasks AS task
    ON task.organization_id = session.organization_id
   AND task.location_id = session.location_id
   AND task.valet_session_id = session.id
   AND task.id = dispatch.task_id

  UNION ALL
  SELECT 'INCIDENT', 3, incident.id, incident.created_at,
         incident.created_at, 'INCIDENT_REPORTED'::text,
         NULL::uuid, NULL::uuid, NULL::uuid,
         incident.reported_by_membership_id, NULL::uuid,
         NULL::uuid, incident.type, incident.severity::text,
         incident.status::text
  FROM scoped AS session
  JOIN incidents AS incident
    ON incident.organization_id = session.organization_id
   AND incident.location_id = session.location_id
   AND incident.valet_session_id = session.id
  JOIN locations AS incident_location
    ON incident_location.organization_id = session.organization_id
   AND incident_location.id = session.location_id
   AND incident_location.status = 'ACTIVE'
),
page AS MATERIALIZED (
  SELECT * FROM evidence
  WHERE ($5::text IS NULL OR source = $5)
    AND ($6::uuid IS NULL OR id = $6::uuid)
  ORDER BY occurred_at ASC, rank ASC, id ASC
  LIMIT $4::integer
)
SELECT page.source, page.id::text AS id,
       page.occurred_at AS "occurredAt",
       page.created_at AS "recordedAt", page.kind,
       page.actor_id::text AS "actorId",
       page.previous_id::text AS "previousId",
       page.next_id::text AS "nextId",
       page.reporter_id::text AS "reporterId",
       page.key_slot_id::text AS "keySlotId",
       page.task_id::text AS "taskId",
       page.incident_type AS "incidentType",
       page.incident_severity AS "incidentSeverity",
       page.incident_status AS "incidentStatus",
       CASE WHEN actor.first_name IS NOT NULL AND actor.last_name IS NOT NULL
         THEN actor.first_name || ' ' || actor.last_name ELSE NULL END AS "actorName",
       CASE WHEN previous.first_name IS NOT NULL AND previous.last_name IS NOT NULL
         THEN previous.first_name || ' ' || previous.last_name ELSE NULL END AS "previousName",
       CASE WHEN successor.first_name IS NOT NULL AND successor.last_name IS NOT NULL
         THEN successor.first_name || ' ' || successor.last_name ELSE NULL END AS "nextName",
       CASE WHEN reporter.first_name IS NOT NULL AND reporter.last_name IS NOT NULL
         THEN reporter.first_name || ' ' || reporter.last_name ELSE NULL END AS "reporterName"
FROM page
LEFT JOIN organization_memberships AS actor
  ON actor.organization_id = $1::uuid AND actor.id = page.actor_id
LEFT JOIN organization_memberships AS previous
  ON previous.organization_id = $1::uuid AND previous.id = page.previous_id
LEFT JOIN organization_memberships AS successor
  ON successor.organization_id = $1::uuid AND successor.id = page.next_id
LEFT JOIN organization_memberships AS reporter
  ON reporter.organization_id = $1::uuid AND reporter.id = page.reporter_id
ORDER BY page.occurred_at ASC, page.rank ASC, page.id ASC`;

export async function readTimelineSources(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  sessionId: string,
  limit: number,
  point?: { readonly source: TimelineSourceRow["source"]; readonly id: string },
): Promise<readonly TimelineSourceRow[]> {
  const result = await tx.query<TimelineSourceRow>(timelineSourceSql, [
    scope.organizationId,
    scope.locationId,
    sessionId,
    limit,
    point?.source ?? null,
    point?.id ?? null,
  ]);
  return result.rows;
}
