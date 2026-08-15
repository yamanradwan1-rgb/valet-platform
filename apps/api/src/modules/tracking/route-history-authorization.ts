import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";

export interface AuthorizedRouteHistory {
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: "LOCATION_MANAGER" | "VALET_SUPERVISOR";
  readonly trackingSessionId: string;
}

export async function authorizeRouteHistory(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  trackingSessionId: string,
): Promise<AuthorizedRouteHistory | null> {
  const result = await transaction.query<{
    location_id: string;
    membership_id: string;
    organization_id: string;
    role: AuthorizedRouteHistory["role"];
    tracking_session_id: string;
  }>(
    `SELECT tracker.id::text AS tracking_session_id,
            tracker.organization_id::text AS organization_id,
            tracker.location_id::text AS location_id,
            membership.id::text AS membership_id, membership.role::text
     FROM task_tracking_sessions AS tracker
     INNER JOIN organizations AS organization
       ON organization.id = tracker.organization_id AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = tracker.organization_id
      AND location.id = tracker.location_id AND location.status = 'ACTIVE'
     INNER JOIN valet_sessions AS session
       ON session.organization_id = tracker.organization_id
      AND session.location_id = tracker.location_id
      AND session.id = tracker.valet_session_id
     INNER JOIN tasks AS task
       ON task.organization_id = tracker.organization_id
      AND task.location_id = tracker.location_id
      AND task.valet_session_id = tracker.valet_session_id
      AND task.id = tracker.task_id
     INNER JOIN organization_memberships AS membership
       ON membership.organization_id = tracker.organization_id
      AND membership.status = 'ACTIVE'
      AND membership.role IN ('LOCATION_MANAGER', 'VALET_SUPERVISOR')
     INNER JOIN users AS actor
       ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = tracker.organization_id
      AND access.membership_id = membership.id
      AND access.location_id = tracker.location_id
     WHERE tracker.id = $2 AND tracker.ended_at IS NOT NULL AND actor.id = $1
     FOR SHARE OF organization, location, session, task, membership, actor, access`,
    [authenticatedUserId, trackingSessionId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (
    row.role === "VALET_SUPERVISOR" &&
    (await lockShiftOperationalEligibility(transaction, {
      locationId: row.location_id,
      membershipId: row.membership_id,
    })) === null
  ) return null;
  return {
    locationId: row.location_id,
    membershipId: row.membership_id,
    organizationId: row.organization_id,
    role: row.role,
    trackingSessionId: row.tracking_session_id,
  };
}
