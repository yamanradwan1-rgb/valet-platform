import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";
import type { AuthorizedKeySession, LockedKeySession } from "./key-types";

async function lockSession(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<LockedKeySession> {
  const result = await transaction.query<LockedKeySession>(
    `SELECT id::text AS session_id, organization_id::text,
            location_id::text, key_slot_id::text, state::text, version
     FROM valet_sessions
     WHERE id = $1
     FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return session;
}

export async function lockAuthorizedKeySession(
  transaction: PostgresTransaction,
  input: {
    readonly authenticatedUserId: string;
    readonly sessionId: string;
  },
): Promise<AuthorizedKeySession> {
  const session = await lockSession(transaction, input.sessionId);
  const membership = await transaction.query<{ id: string }>(
    `SELECT id::text
     FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [session.organization_id, input.authenticatedUserId],
  );
  const membershipId = membership.rows[0]?.id;
  if (membershipId === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId,
  });
  if (eligibility === null) {
    throw new CustodyStaffAuthorizationError("AUTHORIZATION_DENIED");
  }
  return { ...session, actorMembershipId: membershipId };
}
