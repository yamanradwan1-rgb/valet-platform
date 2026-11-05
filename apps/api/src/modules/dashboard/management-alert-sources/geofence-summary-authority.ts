import type { PostgresTransaction } from "../../../common/database/postgres";
import { DashboardOverviewError } from "../dashboard-overview-error";
import {
  requireManagementAlertSourceScope,
  type ManagementAlertReaderInput,
} from "./management-alert-source-contract";

interface TrackingSummaryRoleRow {
  readonly role: "ORG_ADMIN" | "LOCATION_MANAGER";
  readonly trackingEnabled: boolean;
}

/**
 * OD-07A grants only a redacted, Task-scoped committed VIOLATION summary.
 * This is NOT an authorization for route history, live GPS or tracker owners.
 * The caller retains the enclosing READ COMMITTED transaction through the
 * guarded event read; the shared Dashboard scope owns Staff/grant/MFA fences.
 */
export async function requireGeofenceSummaryScope(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
) {
  const scope = await requireManagementAlertSourceScope(transaction, input);
  const roles = await transaction.query<TrackingSummaryRoleRow>(
    `SELECT membership.role::text AS role,
            COALESCE(location.tracking_enabled_override,
                     organization.tracking_enabled) AS "trackingEnabled"
     FROM organization_memberships AS membership
     JOIN users AS actor
       ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
     JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2 AND location.status = 'ACTIVE'
     LEFT JOIN membership_location_access AS access
       ON access.organization_id = organization.id
      AND access.membership_id = membership.id
      AND access.location_id = location.id
     WHERE organization.id = $1 AND membership.id = $3
       AND membership.user_id = $4 AND membership.status = 'ACTIVE'
       AND (
         membership.role = 'ORG_ADMIN'
         OR (membership.role = 'LOCATION_MANAGER' AND access.location_id IS NOT NULL)
       )
     FOR SHARE OF membership, actor, organization, location`,
    [
      scope.organizationId,
      scope.locationId,
      scope.membershipId,
      input.context.userId,
    ],
  );
  // An inactive tracking policy cannot be turned into historical monitoring.
  // This purpose-specific summary check grants no access to raw GPS.
  if (roles.rowCount !== 1 || roles.rows[0]?.trackingEnabled !== true) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  return scope;
}
