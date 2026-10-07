import type { TaskQueueTrackingProjection } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";

interface EligibleTrackingRow {
  readonly session_id: string;
  readonly task_id: string;
  readonly task_type: "PARKING" | "RETRIEVAL";
  readonly tracking_session_id: string;
  readonly tracking_started_at: Date;
}

export async function loadEmployeeTaskTrackingProjection(
  transaction: PostgresTransaction,
  input: {
    readonly locationId: string;
    readonly membershipId: string;
  },
): Promise<TaskQueueTrackingProjection> {
  const result = await transaction.query<EligibleTrackingRow>(
    `SELECT
       task.id::text AS task_id,
       task.valet_session_id::text AS session_id,
       task.task_type::text AS task_type,
       tracker.id::text AS tracking_session_id,
       tracker.started_at AS tracking_started_at
     FROM tasks AS task
     INNER JOIN valet_sessions AS session
       ON session.id = task.valet_session_id
      AND session.organization_id = task.organization_id
      AND session.location_id = task.location_id
     INNER JOIN locations AS location
       ON location.id = task.location_id
      AND location.organization_id = task.organization_id
     INNER JOIN organizations AS organization
       ON organization.id = task.organization_id
     INNER JOIN task_tracking_sessions AS tracker
       ON tracker.organization_id = task.organization_id
      AND tracker.location_id = task.location_id
      AND tracker.valet_session_id = task.valet_session_id
      AND tracker.task_id = task.id
      AND tracker.ended_at IS NULL
     WHERE task.location_id = $1
       AND task.current_assignee_membership_id = $2
       AND task.status = 'IN_PROGRESS'
       AND COALESCE(location.tracking_enabled_override,
                    organization.tracking_enabled) = TRUE
       AND ((task.task_type = 'PARKING' AND session.state = 'PARKING')
         OR (task.task_type = 'RETRIEVAL' AND session.state = 'RETRIEVING'))
     ORDER BY task.id
     LIMIT 2`,
    [input.locationId, input.membershipId],
  );

  if (result.rows.length === 0) return { status: "NONE" };
  if (result.rows.length > 1) return { status: "AMBIGUOUS" };
  const row = result.rows[0]!;
  return {
    movement: {
      sessionId: row.session_id,
      taskId: row.task_id,
      taskType: row.task_type,
      trackingSessionId: row.tracking_session_id,
      trackingStartedAt: row.tracking_started_at.toISOString(),
    },
    status: "ELIGIBLE",
  };
}
