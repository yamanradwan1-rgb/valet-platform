import type { PostgresTransaction } from "../../common/database/postgres";

export type ManagementCommercialRequirement =
  | "DASHBOARD_ACCESS"
  | "REPORT_EXPORTS"
  | "BASIC_BRANDING";

interface EntitlementRow {
  readonly basicBrandingEnabled: boolean;
  readonly dashboardAccessEnabled: boolean;
  readonly reportExportsEnabled: boolean;
}

export function allowsManagementCommercialAccess(
  entitlements: EntitlementRow | null,
  requirement: ManagementCommercialRequirement,
): boolean {
  if (entitlements === null || !entitlements.dashboardAccessEnabled) return false;
  switch (requirement) {
    case "DASHBOARD_ACCESS":
      return true;
    case "REPORT_EXPORTS":
      return entitlements.reportExportsEnabled;
    case "BASIC_BRANDING":
      return entitlements.basicBrandingEnabled;
    default:
      return false;
  }
}

export async function hasManagementCommercialAccess(
  transaction: PostgresTransaction,
  organizationId: string,
  requirement: ManagementCommercialRequirement,
): Promise<boolean> {
  const result = await transaction.query<EntitlementRow>(
    `SELECT dashboard_access_enabled AS "dashboardAccessEnabled",
            report_exports_enabled AS "reportExportsEnabled",
            basic_branding_enabled AS "basicBrandingEnabled"
     FROM organization_subscriptions
     WHERE organization_id = $1`,
    [organizationId],
  );
  return allowsManagementCommercialAccess(result.rows[0] ?? null, requirement);
}
