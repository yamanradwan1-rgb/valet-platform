/**
 * One canonical row per persisted source ID (not per relational join).
 * Every arm is independently scoped to the same Organization and Location.
 * No current slot or Task assignee is used as a historical witness.
 */
export const searchWitnessSql = `
WITH scoped_location AS MATERIALIZED (
  SELECT id, status FROM locations
   WHERE organization_id = $1::uuid AND id = $2::uuid
),
witnesses AS MATERIALIZED (
  SELECT 'AUDIT'::text AS source, a.id, resolved.id AS session_id,
         a.occurred_at, NULL::uuid AS slot_id,
         CASE WHEN a.event_type::text = ANY($15::text[])
                   AND (a.actor_type IS NULL OR a.actor_type = 'MEMBERSHIP')
                   -- W3 records a legacy NULL-birth Session-entity anchor as
                   -- UNVERIFIABLE, without its historical actor.
                   AND NOT (a.valet_session_id IS NULL
                     AND a.entity_type IN ('ValetSession', 'VALET_SESSION')
                     AND (a.pagination_birth_xid IS NULL
                       OR (a.event_type = 'VALET_SESSION_PARKED'
                         AND NOT (a.metadata_json ? 'taskId'))))
           THEN a.actor_membership_id ELSE NULL END AS actor_id,
         NULL::uuid AS previous_id, NULL::uuid AS new_id,
         NULL::uuid AS reporter_id
    FROM audit_events a
    LEFT JOIN tasks task_ref ON task_ref.id = a.entity_id
      AND a.entity_type IN ('Task', 'TASK')
      AND task_ref.organization_id = $1::uuid
      AND task_ref.location_id = $2::uuid
      AND (task_ref.pagination_birth_xid IS NULL OR
        pg_visible_in_snapshot(task_ref.pagination_birth_xid, $10::pg_snapshot))
    LEFT JOIN incidents incident_ref ON incident_ref.id = a.entity_id
      AND a.entity_type IN ('Incident', 'INCIDENT')
      AND incident_ref.organization_id = $1::uuid
      AND incident_ref.location_id = $2::uuid
      AND (incident_ref.pagination_birth_xid IS NULL OR
        pg_visible_in_snapshot(incident_ref.pagination_birth_xid, $10::pg_snapshot))
    -- DEC-103 third discovery arm. Text equality avoids casting untrusted
    -- JSON to uuid, and only the canonical PARKED event uses this path.
    LEFT JOIN tasks task_meta ON task_meta.id::text = a.metadata_json->>'taskId'
      AND a.event_type = 'VALET_SESSION_PARKED'
      AND task_meta.task_type = 'PARKING'
      AND task_meta.organization_id = $1::uuid
      AND task_meta.location_id = $2::uuid
      AND (task_meta.pagination_birth_xid IS NULL OR
        pg_visible_in_snapshot(task_meta.pagination_birth_xid, $10::pg_snapshot))
    JOIN valet_sessions resolved
      ON resolved.id = COALESCE(a.valet_session_id,
        CASE WHEN a.entity_type IN ('ValetSession', 'VALET_SESSION')
          THEN a.entity_id END,
        task_ref.valet_session_id, incident_ref.valet_session_id,
        task_meta.valet_session_id)
     AND resolved.organization_id = $1::uuid
     AND resolved.location_id = $2::uuid
   WHERE a.organization_id = $1::uuid AND a.location_id = $2::uuid
     AND a.occurred_at >= $3::timestamptz AND a.occurred_at < $4::timestamptz
     AND a.created_at <= $9::timestamptz
     AND (a.pagination_birth_xid IS NULL OR
       pg_visible_in_snapshot(a.pagination_birth_xid, $10::pg_snapshot))
     AND (resolved.pagination_birth_xid IS NULL OR
       pg_visible_in_snapshot(resolved.pagination_birth_xid, $10::pg_snapshot))
     -- Canonical TASK, INCIDENT and PARKED writers persist a direct Session.
     -- No writer certificate establishes that a NULL-direct Task/Incident/
     -- metadata parent was historically attached to its CURRENT Session.
     -- Even matching birth XIDs are insufficient proof of that relationship.
     AND (a.valet_session_id IS NOT NULL
       OR (a.entity_type IN ('ValetSession', 'VALET_SESSION')
         AND a.entity_id = resolved.id))
     AND (a.valet_session_id IS NULL OR a.valet_session_id = resolved.id)
     -- A direct Session pointer does not override a contradictory Vehicle
     -- entity reference. Otherwise a malformed Audit row could become a
     -- false historical employee/time witness for the wrong vehicle.
     AND (a.entity_type NOT IN ('Vehicle', 'VEHICLE')
       OR (a.valet_session_id = resolved.id AND a.entity_id = resolved.vehicle_id))
     AND (a.entity_type NOT IN ('ValetSession', 'VALET_SESSION')
       OR a.entity_id = resolved.id)
     -- A direct Session ID cannot override a contradictory or foreign-scope
     -- Task/Incident entity link. Require positive canonical ownership.
     AND (a.entity_type NOT IN ('Task', 'TASK')
       OR (task_ref.id IS NOT NULL AND task_ref.valet_session_id = resolved.id))
     AND (a.entity_type NOT IN ('Incident', 'INCIDENT')
       OR (incident_ref.id IS NOT NULL AND incident_ref.valet_session_id = resolved.id))
     AND (task_meta.id IS NULL OR task_meta.valet_session_id = resolved.id)
     AND (a.event_type <> 'VALET_SESSION_PARKED'
       OR NOT (a.metadata_json ? 'taskId')
       OR (task_meta.id IS NOT NULL AND task_meta.valet_session_id = resolved.id))
     -- Two independently valid Task references must identify the SAME
     -- historical Task, not merely two Tasks belonging to one Session.
     AND (a.event_type <> 'VALET_SESSION_PARKED'
       OR a.entity_type NOT IN ('Task', 'TASK')
       OR NOT (a.metadata_json ? 'taskId')
       OR task_ref.id = task_meta.id)
     -- The known PARKED writer records a ValetSession entity; a verified
     -- Task entity is a conservative legacy alternative. A Task metadata
     -- hint must never certify an unknown or contradictory entity type.
     AND (a.event_type <> 'VALET_SESSION_PARKED'
       OR a.entity_type IN ('ValetSession', 'VALET_SESSION', 'Task', 'TASK'))
     AND (a.event_type <> 'VALET_SESSION_PARKED'
       OR a.entity_type NOT IN ('Task', 'TASK')
       OR task_ref.task_type = 'PARKING')
  UNION ALL
  SELECT 'KEY_CUSTODY', k.id, k.valet_session_id, k.occurred_at,
         k.key_slot_id, k.actor_membership_id, NULL::uuid, NULL::uuid, NULL::uuid
    FROM key_custody_events k
    JOIN valet_sessions s ON s.organization_id = k.organization_id
      AND s.location_id = k.location_id AND s.id = k.valet_session_id
   WHERE k.organization_id = $1::uuid AND k.location_id = $2::uuid
     AND k.occurred_at >= $3::timestamptz AND k.occurred_at < $4::timestamptz
     AND k.created_at <= $9::timestamptz
     AND (k.pagination_birth_xid IS NULL OR
       pg_visible_in_snapshot(k.pagination_birth_xid, $10::pg_snapshot))
     AND (s.pagination_birth_xid IS NULL OR
       pg_visible_in_snapshot(s.pagination_birth_xid, $10::pg_snapshot))
  UNION ALL
  SELECT 'DISPATCH', d.id, d.valet_session_id, d.occurred_at,
         NULL::uuid, d.actor_membership_id,
         d.previous_assignee_membership_id, d.new_assignee_membership_id, NULL::uuid
    FROM dispatch_events d
    JOIN tasks t ON t.organization_id = d.organization_id
      AND t.location_id = d.location_id AND t.id = d.task_id
      AND t.valet_session_id = d.valet_session_id
      AND (t.pagination_birth_xid IS NULL OR
        pg_visible_in_snapshot(t.pagination_birth_xid, $10::pg_snapshot))
    JOIN valet_sessions s ON s.organization_id = d.organization_id
      AND s.location_id = d.location_id AND s.id = d.valet_session_id
   WHERE d.organization_id = $1::uuid AND d.location_id = $2::uuid
     AND d.occurred_at >= $3::timestamptz AND d.occurred_at < $4::timestamptz
     AND d.created_at <= $9::timestamptz
     AND (d.pagination_birth_xid IS NULL OR
       pg_visible_in_snapshot(d.pagination_birth_xid, $10::pg_snapshot))
     AND (s.pagination_birth_xid IS NULL OR
       pg_visible_in_snapshot(s.pagination_birth_xid, $10::pg_snapshot))
  UNION ALL
  SELECT 'INCIDENT', i.id, i.valet_session_id, i.created_at,
         NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
         i.reported_by_membership_id
    FROM incidents i
    JOIN scoped_location location ON location.status = 'ACTIVE'
    JOIN valet_sessions s ON s.organization_id = i.organization_id
      AND s.location_id = i.location_id AND s.id = i.valet_session_id
   WHERE i.organization_id = $1::uuid AND i.location_id = $2::uuid
     AND i.created_at >= $3::timestamptz AND i.created_at < $4::timestamptz
     AND i.created_at <= $9::timestamptz
     AND (i.pagination_birth_xid IS NULL OR
       pg_visible_in_snapshot(i.pagination_birth_xid, $10::pg_snapshot))
     AND (s.pagination_birth_xid IS NULL OR
       pg_visible_in_snapshot(s.pagination_birth_xid, $10::pg_snapshot))
),
classified AS MATERIALIZED (
  SELECT w.*,
     ($5::uuid IS NOT NULL AND w.slot_id = $5::uuid) AS key_match,
     CASE WHEN $6::uuid IS NULL THEN NULL::text
       WHEN w.actor_id = $6::uuid THEN 'ACTOR'
       WHEN w.previous_id = $6::uuid THEN 'PREVIOUS_ASSIGNEE'
       WHEN w.new_id = $6::uuid THEN 'NEW_ASSIGNEE'
       WHEN w.reporter_id = $6::uuid THEN 'REPORTER'
       ELSE NULL END AS employee_role
    FROM witnesses w
),
qualified AS MATERIALIZED (
  SELECT session_id
    FROM classified
   GROUP BY session_id
  HAVING ($5::uuid IS NULL OR bool_or(key_match))
     AND ($6::uuid IS NULL OR bool_or(employee_role IS NOT NULL))
),
matched AS MATERIALIZED (
  SELECT w.* FROM classified w
    JOIN qualified q ON q.session_id = w.session_id
   WHERE (($5::uuid IS NULL AND $6::uuid IS NULL)
     OR w.key_match OR w.employee_role IS NOT NULL)
),
summary AS (
  SELECT session_id, min(occurred_at) AS first_at,
         max(occurred_at) AS last_at, count(*)::int AS record_count,
         count(*) FILTER (WHERE source = 'INCIDENT')::int AS incident_count
    FROM matched GROUP BY session_id
)
`;
