import type { ManagementCapability } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import {
  recordAdminActivityInTransaction,
  requireMfaAssuranceInTransaction,
} from "../auth/mfa/mfa-assurance-policy";
import {
  authorizeCompanyAdminManagement,
  eligibleCompanyAdminLocationOrganization,
} from "../management/management-authorization";
import {
  authorizeDashboardLocation,
  type DashboardLocationScope,
} from "./dashboard-location-authorization";

export type DashboardReadCapability = Extract<
  ManagementCapability,
  | "ANALYTICS_READ"
  | "LOCATION_DASHBOARD_READ"
  | "REPORT_EXPORT"
  | "REPORTS_READ"
>;

export async function authorizeDashboardReadLocation(
  transaction: PostgresTransaction,
  input: {
    readonly authenticatedUserId: string;
    readonly capability: DashboardReadCapability;
    readonly recordActivity?: boolean;
    readonly staffSessionContext?: StaffSessionContext;
    readonly targetLocationId: string;
  },
): Promise<DashboardLocationScope | null> {
  const commercialRequirement =
    input.capability === "REPORT_EXPORT"
      ? "REPORT_EXPORTS"
      : "DASHBOARD_ACCESS";
  // This first read is only a hint. The canonical Staff Management grant
  // writer holds an EXCLUSIVE staff-management-org advisory lock before it
  // changes membership_location_access. A successful Dashboard read must
  // acquire the matching SHARED transaction lock and recheck its authority
  // after any earlier writer commits, keeping the lock through projection.
  const managerHint = await authorizeDashboardLocation(
    transaction,
    input.authenticatedUserId,
    input.targetLocationId,
    commercialRequirement,
  );
  if (managerHint !== null) {
    if (input.capability === "REPORT_EXPORT") {
      const context = input.staffSessionContext;
      if (context === undefined || context.userId !== input.authenticatedUserId)
        return null;
      // Revalidate the export session BEFORE the management advisory lock:
      // staff security writers take their session lock before the org lock.
      if ((await lockAndRecheckStaffSessionContext(transaction, context)) === undefined)
        return null;
    }
    const fence = await transaction.query<{ readonly readCommitted: boolean }>(
      `SELECT pg_advisory_xact_lock_shared(
         hashtextextended('staff-management-org:' || $1::text, 0)
       ), current_setting('transaction_isolation') = 'read committed'
         AS "readCommitted"`,
      [managerHint.organizationId],
    );
    // The second authorization statement must observe the writer's committed
    // DELETE. REPEATABLE READ/SERIALIZABLE can reuse an older MVCC snapshot
    // even after the advisory lock becomes available; fail closed instead.
    if (fence.rows[0]?.readCommitted !== true) return null;
    const manager = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.targetLocationId,
      commercialRequirement,
    );
    // A concurrent role/grant change is denied, not retried as a CA read:
    // promoting an already-held SHARED org lock to EXCLUSIVE on the same
    // connection can deadlock two simultaneous readers. A fresh CA request
    // takes the existing independently authorized MFA path below.
    return manager?.organizationId === managerHint.organizationId &&
      manager.membershipId === managerHint.membershipId
      ? manager
      : null;
  }
  const context = input.staffSessionContext;
  if (context === undefined || context.userId !== input.authenticatedUserId)
    return null;
  const organizationId = await eligibleCompanyAdminLocationOrganization(
    transaction,
    context.userId,
    input.targetLocationId,
  );
  if (organizationId === null) return null;
  await requireMfaAssuranceInTransaction(transaction, context);
  try {
    const scope = await authorizeCompanyAdminManagement(transaction, context, {
      capability: input.capability,
      commercialRequirement,
      organizationId,
      requireActiveLocation: true,
      targetLocationId: input.targetLocationId,
    });
    if (input.recordActivity !== false) {
      await recordAdminActivityInTransaction(transaction, context);
    }
    return {
      locationId: input.targetLocationId,
      membershipId: scope.membershipId,
      organizationId: scope.organizationId,
    };
  } catch (error) {
    if ((error as { code?: unknown }).code === "AUTHORIZATION_DENIED")
      return null;
    throw error;
  }
}
