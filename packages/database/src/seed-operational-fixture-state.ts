interface QueryableClient {
  query<T>(sql: string, values: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface DemoOperationalFixtureState {
  readonly handoff_present: boolean;
  readonly parked_state: string;
  readonly request_status: string;
  readonly session_state: string;
  readonly supervisor_access: boolean;
  readonly supervisor_active_shifts: number;
  readonly supervisor_role: string;
  readonly supervisor_status: string;
  readonly task_id: string;
  readonly task_owner: string;
  readonly task_status: string;
  readonly valet_active_shifts: number;
  readonly valet_open_tasks: number;
}

export async function readDemoOperationalFixtureState(
  client: QueryableClient,
  ids: {
    readonly ammanLocation: string;
    readonly parkedSession: string;
    readonly readySession: string;
    readonly retrievalTask: string;
    readonly supervisorMembership: string;
    readonly valetMembership: string;
  },
): Promise<DemoOperationalFixtureState[]> {
  const result = await client.query<DemoOperationalFixtureState>(
    `SELECT s.state::text AS session_state, t.id::text AS task_id,
            t.status::text AS task_status, t.current_assignee_membership_id::text AS task_owner,
            r.status::text AS request_status, m.role::text AS supervisor_role,
            m.status::text AS supervisor_status,
            (SELECT state::text FROM valet_sessions WHERE id = $6) AS parked_state,
            EXISTS (SELECT 1 FROM membership_location_access a
                    WHERE a.membership_id = $3 AND a.location_id = $2) AS supervisor_access,
            (SELECT count(*)::int FROM shifts h WHERE h.location_id = $2
               AND h.membership_id = $3 AND h.status = 'ACTIVE') AS supervisor_active_shifts,
            (SELECT count(*)::int FROM shifts h WHERE h.location_id = $2
               AND h.membership_id = $4 AND h.status = 'ACTIVE') AS valet_active_shifts,
            (SELECT count(*)::int FROM tasks o WHERE o.current_assignee_membership_id = $4
               AND o.status IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')) AS valet_open_tasks,
            EXISTS (SELECT 1 FROM handoff_verifications v
                    WHERE v.valet_session_id = s.id AND v.consumed_at IS NULL) AS handoff_present
     FROM valet_sessions s
     JOIN tasks t ON t.id = $5 AND t.valet_session_id = s.id
     JOIN retrieval_requests r ON r.valet_session_id = s.id
     JOIN organization_memberships m ON m.id = $3
     WHERE s.id = $1`,
    [
      ids.readySession,
      ids.ammanLocation,
      ids.supervisorMembership,
      ids.valetMembership,
      ids.retrievalTask,
      ids.parkedSession,
    ],
  );
  return result.rows;
}
