import type { PostgresTransaction } from "../../../common/database/postgres";
import { DashboardOverviewError } from "../dashboard-overview-error";
import {
  requireManagementAlertSourceScope,
  type ManagementAlertReaderInput,
} from "./management-alert-source-contract";

/**
 * DEC-111 financial-only alert authority. The normal dashboard grant is first
 * rechecked with the exact Staff session, MFA, entitlement and revocation fence.
 * This second check establishes an owning, active Payment-source role/scope.
 * It grants no general Payment, audit, callback or financial mutation permission.
 */
export async function requireFinancialAlertSourceScope(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
) {
  const scope = await requireManagementAlertSourceScope(transaction, input);
  const owner = await transaction.query(
    `SELECT 1
     FROM organization_memberships AS membership
     JOIN users AS actor ON actor.id = membership.user_id
       AND actor.status = 'ACTIVE'
     JOIN organizations AS organization ON organization.id = membership.organization_id
       AND organization.status = 'ACTIVE'
     JOIN locations AS location ON location.organization_id = organization.id
       AND location.id = $2 AND location.status = 'ACTIVE'
     WHERE organization.id = $1
       AND membership.id = $3
       AND membership.user_id = $4
       AND membership.status = 'ACTIVE'
       AND (
         membership.role = 'ORG_ADMIN'
         OR (membership.role = 'LOCATION_MANAGER' AND EXISTS (
           SELECT 1 FROM membership_location_access AS access
           WHERE access.organization_id = organization.id
             AND access.membership_id = membership.id
             AND access.location_id = location.id
         ))
       )
     FOR SHARE OF membership, actor, organization, location`,
    [
      scope.organizationId,
      scope.locationId,
      scope.membershipId,
      input.context.userId,
    ],
  );
  if (owner.rowCount !== 1) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  return scope;
}
