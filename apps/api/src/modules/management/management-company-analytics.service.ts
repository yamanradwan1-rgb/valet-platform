import { Inject, Injectable } from "@nestjs/common";
import type { CompanyAnalyticsResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { inFencedCompanyAdminRrSnapshot } from "./company-admin-rr-snapshot";
import { composeCompanyAnalyticsSources } from "./company-analytics-source";

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
    return inFencedCompanyAdminRrSnapshot(this.pool, context, organizationId,
      "ANALYTICS_READ", async (transaction, authorizedOrgId) => {
      const summary = await composeCompanyAnalyticsSources(transaction, {
        from: period.from,
        organizationId: authorizedOrgId,
        to: period.to,
      });
      return {
        from: period.from,
        organizationId: authorizedOrgId,
        summary,
        to: period.to,
      };
    });
  }
}
