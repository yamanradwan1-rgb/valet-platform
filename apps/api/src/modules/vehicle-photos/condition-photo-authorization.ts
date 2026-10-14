import { UnauthorizedException } from "@nestjs/common";

import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  lockAndRecheckStaffSessionContext,
} from "../auth/staff-session-revalidation";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";
import type { ConditionPhotoReadScope } from "./condition-photo-status-query";

interface PersistedPhotoSessionScope {
  readonly organization_id: string;
  readonly location_id: string;
}

/** Auth token + current User/tenant/member/location locks precede every mutation. */
export async function authorizeConditionPhotoScope(
  transaction: PostgresTransaction,
  credential: StaffSessionContext,
  valetSessionId: string,
): Promise<ConditionPhotoReadScope> {
  const exactSession = await lockAndRecheckStaffSessionContext(transaction, credential);
  if (exactSession === undefined) throw new UnauthorizedException();
  await requireActiveCustodyUser(transaction, credential.userId);
  const result = await transaction.query<PersistedPhotoSessionScope>(
    `SELECT organization_id::text, location_id::text
     FROM valet_sessions
     WHERE id = $1`,
    [valetSessionId],
  );
  const session = result.rows[0];
  if (session === undefined)
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  const actor = await authorizeCustodyActorForPersistedScope(transaction, {
    allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
    authenticatedUserId: credential.userId,
    resourceScope: {
      organizationId: session.organization_id,
      locationId: session.location_id,
    },
  });
  return {
    organizationId: session.organization_id,
    locationId: session.location_id,
    valetSessionId,
    actorMembershipId: actor.membershipId,
  };
}

/** Read-only pre-parser scope proof. Ends locks before handling request bytes. */
export async function resolveAuthorizedConditionPhotoScope(
  pool: PostgresPool,
  credential: StaffSessionContext,
  valetSessionId: string,
): Promise<ConditionPhotoReadScope> {
  return await inPostgresTransaction(pool, (transaction) =>
    authorizeConditionPhotoScope(transaction, credential, valetSessionId),
  );
}
