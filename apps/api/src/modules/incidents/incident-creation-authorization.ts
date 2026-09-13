import type { PostgresTransaction } from "../../common/database/postgres";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
  type AuthorizedCustodyActor,
} from "../staff/custody-staff-authorizer";
import {
  loadParkingTasks,
  loadSessionScope,
  type SessionScopeRow,
} from "../staff/staff-valet-session-queries";
import { authorizeSessionAccess } from "../staff/staff-valet-session-authorization";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";

export interface IncidentCreationAuthority {
  readonly actor: AuthorizedCustodyActor;
  readonly session: SessionScopeRow;
}

export async function authorizeIncidentCreation(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  sessionId: string,
): Promise<IncidentCreationAuthority> {
  await requireActiveCustodyUser(transaction, authenticatedUserId);
  const session = await loadSessionScope(transaction, sessionId);
  if (session.state === "COMPLETED") {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  const actor = await authorizeCustodyActorForPersistedScope(transaction, {
    allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
    authenticatedUserId,
    resourceScope: {
      locationId: session.location_id,
      organizationId: session.organization_id,
    },
  });
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId: actor.membershipId,
  });
  if (eligibility === null) {
    throw new CustodyStaffAuthorizationError("LOCATION_ACCESS_DENIED");
  }
  if (actor.role === "VALET_EMPLOYEE") {
    authorizeSessionAccess(
      session,
      await loadParkingTasks(transaction, session),
      actor.membershipId,
      actor.role,
    );
  }
  return { actor, session };
}
