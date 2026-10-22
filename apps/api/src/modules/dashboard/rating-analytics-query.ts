import { UnauthorizedException } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { queryRatingAnalyticsProjection } from "../management/rating-analytics-projection-query";
import type { AnalyticsPeriod } from "./analytics-period";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";

export function locationRatingAnalytics(
  pool: PostgresPool,
  context: StaffSessionContext,
  locationId: string,
  period: AnalyticsPeriod,
) {
  return inPostgresTransaction(pool, async (transaction) => {
    // Exact session first, then #315's shared Organization grant fence.
    if ((await lockAndRecheckStaffSessionContext(transaction, context)) === undefined) {
      throw new UnauthorizedException();
    }
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: context.userId,
      capability: "ANALYTICS_READ",
      staffSessionContext: context,
      targetLocationId: locationId,
    });
    assertAuthorized(scope);
    const projection = await queryRatingAnalyticsProjection(
      transaction, scope.organizationId, scope.locationId, period,
    );
    return { ...projection, from: period.from, to: period.to, scope: "LOCATION" };
  });
}
