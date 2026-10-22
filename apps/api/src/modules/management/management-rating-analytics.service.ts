import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { AnalyticsPeriod } from "../dashboard/analytics-period";
import { authorizeCompanyAdminManagement } from "./management-authorization";
import { queryRatingAnalyticsProjection } from "./rating-analytics-projection-query";

@Injectable()
export class ManagementRatingAnalyticsService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  allLocations(context: StaffSessionContext, organizationId: string, period: AnalyticsPeriod) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      // READ COMMITTED is needed for the post-lock membership/revocation check.
      const scope = await authorizeCompanyAdminManagement(transaction, context, {
        capability: "ANALYTICS_READ",
        organizationId,
      });
      const projection = await queryRatingAnalyticsProjection(
        transaction, scope.organizationId, null, period,
      );
      await recordAdminActivityInTransaction(transaction, context);
      return { ...projection, from: period.from, to: period.to, scope: "ALL_LOCATIONS" };
    });
  }
}
