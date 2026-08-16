import type { PostgresTransaction } from "../../common/database/postgres";
import { CashMutationError } from "./cash-errors";
import type { CashAuthorization } from "./cash-types";

interface AuthorizationRow {
  location_id: string;
  membership_id: string;
  organization_id: string;
  role: CashAuthorization["actor"]["role"];
  valet_session_id: string;
}

export async function authorizeCashMutation(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  valetSessionId: string,
  managerOnly = false,
): Promise<CashAuthorization> {
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
       ON membership.organization_id = session.organization_id
      AND membership.status = 'ACTIVE'
      AND membership.role IN
        ('LOCATION_MANAGER', 'VALET_EMPLOYEE', 'VALET_SUPERVISOR')
     INNER JOIN users AS actor
       ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = session.organization_id
      AND access.membership_id = membership.id
      AND access.location_id = session.location_id
     WHERE session.id = $2 AND actor.id = $1
       AND ($3::boolean = false OR membership.role = 'LOCATION_MANAGER')
     FOR SHARE OF session, location, organization, membership, actor, access`,
    [authenticatedUserId, valetSessionId, managerOnly],
  );
  const row = result.rows[0];
  if (row === undefined) throw new CashMutationError("AUTHORIZATION_DENIED");
  return {
    actor: { membershipId: row.membership_id, role: row.role },
    scope: {
      locationId: row.location_id,
      organizationId: row.organization_id,
      valetSessionId: row.valet_session_id,
    },
  };
}

export async function lockRequiredOperationalShift(
  transaction: PostgresTransaction,
  authorization: CashAuthorization,
): Promise<void> {
  if (authorization.actor.role === "LOCATION_MANAGER") return;
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text
     FROM shifts
     WHERE organization_id = $1 AND location_id = $2
       AND membership_id = $3 AND status = 'ACTIVE'
     FOR SHARE`,
    [
      authorization.scope.organizationId,
      authorization.scope.locationId,
      authorization.actor.membershipId,
    ],
  );
  if (result.rows[0] === undefined) {
    throw new CashMutationError("AUTHORIZATION_DENIED");
  }
}
