import type { PostgresTransaction } from "../../../common/database/postgres";
import type { DashboardLocationScope } from "../dashboard-location-authorization";
import { DashboardOverviewError } from "../dashboard-overview-error";
import {
  requireManagementAlertSourceScope,
  type ManagementAlertReaderInput,
} from "./management-alert-source-contract";

/**
 * OD-07A: purpose-limited Task/Retrieval management source read, not custody
 * detail, Task mutation, takeover, audit investigation, or location tracking.
 * The existing management Task/queue readers authorize CA or exact-granted LM;
 * this independent source fence rechecks that *same* narrow role/source scope
 * before the reader examines any Task, Session, request or Audit candidate.
 */
export async function requireRetrievalPhaseSourceScope(
  tx: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<DashboardLocationScope> {
  const scope = await requireManagementAlertSourceScope(tx, input);
  const result = await tx.query<{ readonly sourceReadAllowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM organization_memberships AS viewer
       JOIN users AS actor ON actor.id=viewer.user_id
         AND actor.status='ACTIVE'
       JOIN organizations AS owner ON owner.id=viewer.organization_id
         AND owner.status='ACTIVE'
       JOIN locations AS location
         ON location.id=$2 AND location.organization_id=owner.id
         AND location.status='ACTIVE'
       JOIN organization_subscriptions AS subscription
         ON subscription.organization_id=owner.id
         AND subscription.dashboard_access_enabled=TRUE
       WHERE viewer.id=$3
         AND viewer.user_id=$4
         AND viewer.organization_id=$1
         AND viewer.status='ACTIVE'
         AND (viewer.role='ORG_ADMIN'
           OR (viewer.role='LOCATION_MANAGER' AND EXISTS (
             SELECT 1 FROM membership_location_access AS access
             WHERE access.organization_id=owner.id
               AND access.membership_id=viewer.id
               AND access.location_id=location.id
           )))
     ) AS "sourceReadAllowed"`,
    [scope.organizationId, scope.locationId, scope.membershipId,
      input.context.userId],
  );
  if (result.rows[0]?.sourceReadAllowed !== true) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  return scope;
}
