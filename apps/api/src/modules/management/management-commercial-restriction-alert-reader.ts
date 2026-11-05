import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "./management-authorization";

export interface CompanyCommercialRestrictionCase {
  readonly category: "ALT-17";
  readonly severity: "IMPORTANT";
  readonly sourceKind: "SUBSCRIPTION";
  readonly organizationId: string;
  readonly title: "Management Dashboard access restricted";
}

/**
 * OD-08G: a CA-only restriction fact for the already-authorized subscription
 * utility. Intentionally no Dashboard/bell route, source timestamp or Seen.
 * The utility may render this case after its own protected CA subscription read.
 */
export async function readCompanyAdminCommercialRestrictionCase(
  transaction: PostgresTransaction,
  input: {
    readonly context: StaffSessionContext;
    readonly organizationId: string;
  },
): Promise<CompanyCommercialRestrictionCase | null> {
  const scope = await authorizeCompanyAdminManagement(
    transaction,
    input.context,
    {
      capability: "COMPANY_DASHBOARD_READ",
      commercialRequirement: null,
      organizationId: input.organizationId,
    },
  );
  // NULL subscription has no effective Dashboard entitlement either.
  // Subscription status/plan are explicitly NOT the commercial authority.
  const result = await transaction.query<{
    readonly dashboardAccessEnabled: boolean;
  }>(
    `SELECT dashboard_access_enabled AS "dashboardAccessEnabled"
     FROM organization_subscriptions
     WHERE organization_id = $1`,
    [scope.organizationId],
  );
  if (result.rows[0]?.dashboardAccessEnabled === true) return null;
  return {
    category: "ALT-17",
    severity: "IMPORTANT",
    sourceKind: "SUBSCRIPTION",
    organizationId: scope.organizationId,
    title: "Management Dashboard access restricted",
  };
}
