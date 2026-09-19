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
  const manager = await authorizeDashboardLocation(
    transaction,
    input.authenticatedUserId,
    input.targetLocationId,
    commercialRequirement,
  );
  if (manager !== null) {
    if (input.capability !== "REPORT_EXPORT") return manager;
    const context = input.staffSessionContext;
    if (context === undefined || context.userId !== input.authenticatedUserId) {
      return null;
    }
    return (await lockAndRecheckStaffSessionContext(transaction, context)) ===
      undefined
      ? null
      : manager;
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
