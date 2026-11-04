import type { PostgresTransaction } from "../../common/database/postgres";
import { authorizeDashboardReadLocation } from "../dashboard/dashboard-read-authorization";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { ManagementAccessDeniedError } from "./management-authorization";

export interface AuthorizedAlertTimingPreferenceScope {
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: "ORG_ADMIN" | "LOCATION_MANAGER";
  readonly userId: string;
}

/**
 * Reusable own-User + Organization read/write boundary for subsequent
 * authorized alert reads. Location is an eligibility gate, never a preference
 * storage dimension. Caller keeps this transaction open through read/write.
 */
export async function authorizeOwnManagementAlertTimingPreferences(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  input: {
    readonly organizationId: string;
    readonly locationId: string;
    readonly sensitiveWrite: boolean;
  },
): Promise<AuthorizedAlertTimingPreferenceScope> {
  // Session security lock precedes the existing staff-management grant lock.
  // No access to preference rows occurs before this authorization completes.
  if (!(await lockAndRecheckStaffSessionContext(transaction, context))) {
    throw new ManagementAccessDeniedError();
  }
  const scope = await authorizeDashboardReadLocation(transaction, {
    authenticatedUserId: context.userId,
    staffSessionContext: context,
    capability: "LOCATION_DASHBOARD_READ",
    recordActivity: false,
    targetLocationId: input.locationId,
  });
  if (scope === null || scope.organizationId !== input.organizationId) {
    throw new ManagementAccessDeniedError();
  }
  const role = await transaction.query<{ role: string }>(
    `SELECT role::text AS role
     FROM organization_memberships
     WHERE id = $1 AND organization_id = $2
       AND user_id = $3 AND status = 'ACTIVE'`,
    [scope.membershipId, scope.organizationId, context.userId],
  );
  const currentRole = role.rows[0]?.role;
  if (currentRole !== "ORG_ADMIN" && currentRole !== "LOCATION_MANAGER") {
    throw new ManagementAccessDeniedError();
  }
  // DEC-109: only Company Admin changed writes require 5-minute freshness;
  // all CA PUTs receive the same sensitive check before any mutation.
  if (input.sensitiveWrite && currentRole === "ORG_ADMIN") {
    await requireMfaAssuranceInTransaction(transaction, context, {
      sensitive: true,
    });
  }
  return {
    membershipId: scope.membershipId,
    organizationId: scope.organizationId,
    role: currentRole,
    userId: context.userId,
  };
}
