import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { FinancialMutationError } from "./payment-mutation-errors";
import type { ProjectionScope } from "./payment-projection-types";

interface AuthorizationRow {
  readonly location_id: string;
  readonly membership_id: string;
  readonly organization_id: string;
  readonly role: "LOCATION_MANAGER" | "VALET_EMPLOYEE" | "VALET_SUPERVISOR";
  readonly valet_session_id: string;
}

export async function authorizeStaffPaymentProjection(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  valetSessionId: string,
): Promise<ProjectionScope> {
  const result = await transaction.query<AuthorizationRow>(
    `SELECT session.id::text AS valet_session_id,
            session.organization_id::text, session.location_id::text,
            membership.id::text AS membership_id, membership.role::text
     FROM valet_sessions AS session
     INNER JOIN locations AS location
       ON location.organization_id = session.organization_id
      AND location.id = session.location_id AND location.status = 'ACTIVE'
     INNER JOIN organizations AS organization
       ON organization.id = session.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN organization_memberships AS membership
       ON membership.organization_id = organization.id
      AND membership.role IN
          ('LOCATION_MANAGER', 'VALET_EMPLOYEE', 'VALET_SUPERVISOR')
      AND membership.status = 'ACTIVE'
     INNER JOIN users AS actor
       ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = organization.id
      AND access.membership_id = membership.id
      AND access.location_id = location.id
     WHERE session.id = $2 AND actor.id = $1
     FOR SHARE OF session, location, organization, membership, actor, access`,
    [authenticatedUserId, valetSessionId],
  );
  const row = result.rows[0];
  if (row === undefined)
    throw new FinancialMutationError("AUTHORIZATION_DENIED");
  if (
    row.role !== "LOCATION_MANAGER" &&
    (await lockShiftOperationalEligibility(transaction, {
      locationId: row.location_id,
      membershipId: row.membership_id,
    })) === null
  ) {
    throw new FinancialMutationError("AUTHORIZATION_DENIED");
  }
  return {
    locationId: row.location_id,
    organizationId: row.organization_id,
    valetSessionId: row.valet_session_id,
  };
}
