import type { LocationSubscriptionResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
import { assertAuthorized } from "./dashboard-overview-error";

interface SubscriptionRow {
  readonly basicBrandingEnabled: boolean;
  readonly dashboardAccessEnabled: boolean;
  readonly organizationId: string;
  readonly planCode: string;
  readonly reportExportsEnabled: boolean;
  readonly status: string;
}

export async function readLocationSubscription(
  pool: PostgresPool,
  input: { authenticatedUserId: string; locationId: string },
): Promise<LocationSubscriptionResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scopeHint = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.locationId,
      null,
    );
    assertAuthorized(scopeHint);
    // Canonical Staff Management writers take this org advisory EXCLUSIVE.
    // Hold its SHARED transaction lock through subscription projection and
    // recheck with a fresh READ COMMITTED snapshot after an earlier revoker.
    const fence = await transaction.query<{ readonly readCommitted: boolean }>(
      `SELECT pg_advisory_xact_lock_shared(
         hashtextextended('staff-management-org:' || $1::text, 0)
       ), current_setting('transaction_isolation') = 'read committed'
         AS "readCommitted"`,
      [scopeHint.organizationId],
    );
    assertAuthorized(fence.rows[0]?.readCommitted === true ? scopeHint : null);
    // Keep subscription reads available even if dashboardAccess is disabled;
    // this is an LM-only scope and must never fall back to Company Admin.
    const scope = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.locationId,
      null,
    );
    assertAuthorized(scope);
    if (
      scope.organizationId !== scopeHint.organizationId ||
      scope.membershipId !== scopeHint.membershipId ||
      scope.locationId !== scopeHint.locationId
    ) {
      assertAuthorized(null);
    }
    const rows = await transaction.query<SubscriptionRow>(
      `SELECT location.organization_id::text AS "organizationId",
              subscription.plan_code AS "planCode",
              subscription.status::text AS status,
              subscription.dashboard_access_enabled
                AS "dashboardAccessEnabled",
              subscription.report_exports_enabled
                AS "reportExportsEnabled",
              subscription.basic_branding_enabled
                AS "basicBrandingEnabled"
       FROM locations AS location
       LEFT JOIN organization_subscriptions AS subscription
         ON subscription.organization_id = location.organization_id
       WHERE location.id = $1 AND location.organization_id = $2`,
      [scope.locationId, scope.organizationId],
    );
    const row = rows.rows[0];
    if (row === undefined) {
      throw new Error("Subscription scope is missing.");
    }
    return {
      locationId: scope.locationId,
      organizationId: row.organizationId,
      subscription:
        row.planCode === null
          ? null
          : {
              entitlements: {
                basicBranding: row.basicBrandingEnabled,
                dashboardAccess: row.dashboardAccessEnabled,
                reportExports: row.reportExportsEnabled,
              },
              planCode: row.planCode,
              status: row.status as NonNullable<
                LocationSubscriptionResponse["subscription"]
              >["status"],
            },
    };
  });
}
