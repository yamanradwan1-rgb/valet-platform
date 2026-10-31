import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";

export async function authorizeTaskRouteHistory(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  taskId: string,
) {
  // Scope is a read hint only. Take the existing lifecycle boundary before row
  // locks, matching Shift eligibility and Location writers' lock order.
  const target = await transaction.query<{ location_id: string }>(
    `SELECT location_id FROM tasks WHERE id = $1`,
    [taskId],
  );
  const locationId = target.rows[0]?.location_id;
  if (locationId === undefined) return null;
  await lockLocationLifecycle(transaction, locationId, "SHARED");
  const result = await transaction.query<{
    organization_id: string;
    location_id: string;
    valet_session_id: string;
    membership_id: string;
    role: "LOCATION_MANAGER" | "VALET_SUPERVISOR";
  }>(
    `SELECT task.organization_id, task.location_id, task.valet_session_id,
            membership.id AS membership_id, membership.role::text
     FROM tasks AS task
     JOIN valet_sessions AS session
       ON session.organization_id = task.organization_id
      AND session.location_id = task.location_id
      AND session.id = task.valet_session_id
     JOIN organizations AS organization
       ON organization.id = task.organization_id AND organization.status = 'ACTIVE'
     JOIN locations AS location
       ON location.organization_id = task.organization_id
      AND location.id = task.location_id AND location.status = 'ACTIVE'
     JOIN organization_memberships AS membership
       ON membership.organization_id = task.organization_id
      AND membership.status = 'ACTIVE'
      AND membership.role IN ('LOCATION_MANAGER', 'VALET_SUPERVISOR')
     JOIN users AS actor
       ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
     JOIN membership_location_access AS access
       ON access.organization_id = task.organization_id
      AND access.membership_id = membership.id
      AND access.location_id = task.location_id
     WHERE task.id = $2 AND actor.id = $1 AND task.location_id = $3
       AND task.status = 'COMPLETED' AND task.task_type IN ('PARKING', 'RETRIEVAL')
     FOR SHARE OF session, task, organization, location, membership, actor, access`,
    [authenticatedUserId, taskId, locationId],
  );
  const scope = result.rows[0];
  if (scope === undefined) return null;
  if (
    scope.role === "VALET_SUPERVISOR" &&
    (await lockShiftOperationalEligibility(transaction, {
      locationId: scope.location_id,
      membershipId: scope.membership_id,
    })) === null
  )
    return null;
  return scope;
}
