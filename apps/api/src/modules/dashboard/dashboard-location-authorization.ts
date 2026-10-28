import type { PostgresTransaction } from "../../common/database/postgres";
import {
  allowsManagementCommercialAccess,
  type ManagementCommercialRequirement,
} from "../management/management-commercial-access-policy";

export interface DashboardLocationScope {
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
}

interface AuthorizedLocationRow extends DashboardLocationScope {
  readonly dashboardAccessEnabled: boolean;
  readonly reportExportsEnabled: boolean;
  readonly basicBrandingEnabled: boolean;
}

export async function authorizeDashboardLocation(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  targetLocationId: string,
  commercialRequirement: ManagementCommercialRequirement | null = "DASHBOARD_ACCESS",
): Promise<DashboardLocationScope | null> {
  // Ungated callers historically needed no subscription read privilege.
  // Both fragments are source-owned constants, never request-provided SQL.
  const commercialColumns =
    commercialRequirement === null
      ? `FALSE AS "dashboardAccessEnabled", FALSE AS "reportExportsEnabled", FALSE AS "basicBrandingEnabled"`
      : `COALESCE(subscription.dashboard_access_enabled, FALSE) AS "dashboardAccessEnabled",
       COALESCE(subscription.report_exports_enabled, FALSE) AS "reportExportsEnabled",
       COALESCE(subscription.basic_branding_enabled, FALSE) AS "basicBrandingEnabled"`;
  const commercialJoin =
    commercialRequirement === null
      ? ""
      : `LEFT JOIN organization_subscriptions AS subscription
       ON subscription.organization_id = organization.id`;
  const result = await transaction.query<AuthorizedLocationRow>(
    `SELECT organization.id::text AS "organizationId",
            location.id::text AS "locationId",
            membership.id::text AS "membershipId",
            ${commercialColumns}
     FROM users AS actor
     INNER JOIN organization_memberships AS membership
       ON membership.user_id = actor.id AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER'
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2 AND location.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = organization.id
      AND access.membership_id = membership.id
      AND access.location_id = location.id
     ${commercialJoin}
     WHERE actor.id = $1 AND actor.status = 'ACTIVE'
     LIMIT 1`,
    [authenticatedUserId, targetLocationId],
  );
  const row = result.rows[0];
  if (
    row === undefined ||
    (commercialRequirement !== null &&
      !allowsManagementCommercialAccess(row, commercialRequirement))
  )
    return null;
  // Return only the existing scope contract, never commercial configuration.
  return {
    locationId: row.locationId,
    membershipId: row.membershipId,
    organizationId: row.organizationId,
  };
}
