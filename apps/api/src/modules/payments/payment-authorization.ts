import type { PostgresTransaction } from "../../common/database/postgres";
import { FinancialMutationError } from "./payment-mutation-errors";
import type { FinancialActor, PaymentScope } from "./payment-mutation-types";

export async function authorizeManagerFinancialMutation(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  valetSessionId: string,
): Promise<{ readonly actor: FinancialActor; readonly scope: PaymentScope }> {
  const result = await transaction.query<{
    location_id: string;
    membership_id: string;
    organization_id: string;
    valet_session_id: string;
  }>(
    `SELECT session.id::text AS valet_session_id,
            session.organization_id::text, session.location_id::text,
            membership.id::text AS membership_id
     FROM valet_sessions AS session
     INNER JOIN locations AS location
       ON location.organization_id = session.organization_id
      AND location.id = session.location_id AND location.status = 'ACTIVE'
     INNER JOIN organizations AS organization
       ON organization.id = session.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN organization_memberships AS membership
       ON membership.organization_id = organization.id
      AND membership.role = 'LOCATION_MANAGER'
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
  return {
    actor: { actorClass: "LOCATION_MANAGER", membershipId: row.membership_id },
    scope: {
      locationId: row.location_id,
      organizationId: row.organization_id,
      valetSessionId: row.valet_session_id,
    },
  };
}
