import type { PostgresTransaction } from "../../common/database/postgres";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
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
  lockSettingsPolicy = false,
): Promise<AuthorizedCheckInLocation> {
  await requireActiveCustodyUser(transaction, authenticatedUserId);
  await lockLocationLifecycle(transaction, locationId, "SHARED");
  const location = await transaction.query<{
    accepting_intake: boolean;
    organization_id: string;
    status: string;
  }>(
    `SELECT organization_id::text, status::text, accepting_intake
     FROM locations
     WHERE id = $1`,
    [locationId],
  );
  const locationRow = location.rows[0];
  if (locationRow === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  const organizationId = locationRow.organization_id;
  if (locationRow.status !== "ACTIVE" || !locationRow.accepting_intake) {
    throw new CustodyStaffAuthorizationError("AUTHORIZATION_DENIED");
  }
  if (lockSettingsPolicy) {
    await lockManagementSettingsOrganization(
      transaction,
      organizationId,
      "SHARED",
    );
  }
  const actor = await authorizeCustodyActorForPersistedScope(transaction, {
    allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
    authenticatedUserId,
    resourceScope: { locationId, organizationId },
  });
  return { actor, locationId, organizationId };
}
