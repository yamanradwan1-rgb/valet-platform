import type { PostgresTransaction } from "../../common/database/postgres";
import {
  authorizeCustodyActorForPersistedScope,
  type AuthorizedCustodyActor,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";

export interface AuthorizedCheckInLocation {
  readonly actor: AuthorizedCustodyActor;
  readonly locationId: string;
  readonly organizationId: string;
}

export async function authorizeCheckInLocation(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  locationId: string,
): Promise<AuthorizedCheckInLocation> {
  await requireActiveCustodyUser(transaction, authenticatedUserId);
  const location = await transaction.query<{ organization_id: string }>(
    `SELECT organization_id::text
     FROM locations
     WHERE id = $1`,
    [locationId],
  );
  const organizationId = location.rows[0]?.organization_id;
  if (organizationId === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  const actor = await authorizeCustodyActorForPersistedScope(transaction, {
    allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
    authenticatedUserId,
    resourceScope: { locationId, organizationId },
  });
  return { actor, locationId, organizationId };
}
