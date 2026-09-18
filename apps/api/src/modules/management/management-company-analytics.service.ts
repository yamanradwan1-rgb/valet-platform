import { Inject, Injectable } from "@nestjs/common";
import type { CompanyAnalyticsResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { composeCompanyAnalyticsSources } from "./company-analytics-source";
import { authorizeCompanyAdminManagement } from "./management-authorization";

@Injectable()
export class ManagementCompanyAnalyticsService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  allLocations(
    context: StaffSessionContext,
    organizationId: string,
    period: { readonly from: string; readonly to: string },
  ): Promise<CompanyAnalyticsResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      await transaction.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const scope = await authorizeCompanyAdminManagement(transaction, context, {
        capability: "ANALYTICS_READ",
        organizationId,
      });
      const summary = await composeCompanyAnalyticsSources(transaction, {
        from: period.from,
        organizationId: scope.organizationId,
        to: period.to,
      });
      await recordAdminActivityInTransaction(transaction, context);
      return {
        from: period.from,
        organizationId: scope.organizationId,
        summary,
        to: period.to,
      };
    });
  }
}
