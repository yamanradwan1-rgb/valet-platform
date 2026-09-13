import type { PostgresTransaction } from "../../common/database/postgres";
import {
  authorizeCustodyActorForPersistedScope,
  requireActiveCustodyUser,
  type AuthorizedCustodyActor,
} from "../staff/custody-staff-authorizer";
import {
  loadSessionScope,
  type SessionScopeRow,
} from "../staff/staff-valet-session-queries";

export async function authorizeIncidentRecovery(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  sessionId: string,
): Promise<{
  readonly actor: AuthorizedCustodyActor;
  readonly session: SessionScopeRow;
}> {
  await requireActiveCustodyUser(transaction, authenticatedUserId);
  const session = await loadSessionScope(transaction, sessionId);
  const actor = await authorizeCustodyActorForPersistedScope(transaction, {
    allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
    authenticatedUserId,
    resourceScope: {
      locationId: session.location_id,
      organizationId: session.organization_id,
    },
  });
  return { actor, session };
}
