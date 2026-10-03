import type { PostgresTransaction } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";
import {
  CustodyMutationError,
  type ValetSessionState,
} from "./protected-custody-command";
import type { CheckInConditionStaffRequest } from "./check-in-condition-command";

export interface CheckInConditionSessionRow {
  check_in_condition_completed_at: Date | null;
  check_in_condition_completed_by_membership_id: string | null;
  location_id: string;
  organization_id: string;
  state: ValetSessionState;
  valet_session_id: string;
  version: number;
}

async function loadSessionScope(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<
  Pick<CheckInConditionSessionRow, "location_id" | "organization_id">
> {
  const result = await transaction.query<{
    location_id: string;
    organization_id: string;
  }>(
    `SELECT organization_id::text, location_id::text
     FROM valet_sessions
     WHERE id = $1`,
    [valetSessionId],
  );
  const scope = result.rows[0];
  if (scope === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return scope;
}

async function lockSessionScope(
  transaction: PostgresTransaction,
  valetSessionId: string,
  organizationId: string,
  locationId: string,
): Promise<CheckInConditionSessionRow> {
  const result = await transaction.query<CheckInConditionSessionRow>(
    `SELECT id::text AS valet_session_id, organization_id::text,
            location_id::text, state::text, version,
            check_in_condition_completed_at,
            check_in_condition_completed_by_membership_id::text
     FROM valet_sessions
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
     FOR UPDATE`,
    [valetSessionId, organizationId, locationId],
  );
  const scope = result.rows[0];
  if (scope === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return scope;
}

export async function authorizeAndLockCheckInConditionSession(
  transaction: PostgresTransaction,
  request: CheckInConditionStaffRequest,
  lockSettingsPolicy = false,
): Promise<{ actorMembershipId: string; session: CheckInConditionSessionRow }> {
  await requireActiveCustodyUser(transaction, request.authenticatedUserId);
  const initialScope = await loadSessionScope(
    transaction,
    request.valetSessionId,
  );
  if (lockSettingsPolicy)
    await lockManagementSettingsOrganization(
      transaction,
      initialScope.organization_id,
      "SHARED",
    );
  const actor = await authorizeCustodyActorForPersistedScope(transaction, {
    allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
    authenticatedUserId: request.authenticatedUserId,
    resourceScope: {
      locationId: initialScope.location_id,
      organizationId: initialScope.organization_id,
    },
  });
  const session = await lockSessionScope(
    transaction,
    request.valetSessionId,
    initialScope.organization_id,
    initialScope.location_id,
  );
  if (session.state === "CANCELLED")
    throw new CustodyMutationError("INVALID_STATE_TRANSITION");
  return { actorMembershipId: actor.membershipId, session };
}
