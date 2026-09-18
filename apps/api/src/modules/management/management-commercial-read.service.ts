import type { ManagementSubscriptionResponse } from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "./management-authorization";

interface SubscriptionRow {
  readonly basicBranding: boolean;
  readonly dashboardAccess: boolean;
  readonly planCode: string;
  readonly reportExports: boolean;
  readonly status: "TRIAL" | "ACTIVE" | "SUSPENDED";
}

@Injectable()
export class ManagementCommercialReadService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  read(
    context: StaffSessionContext,
    organizationId: string,
  ): Promise<ManagementSubscriptionResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const scope = await authorizeCompanyAdminManagement(transaction, context, {
        capability: "COMPANY_DASHBOARD_READ",
        commercialRequirement: null,
        organizationId,
      });
      const result = await transaction.query<SubscriptionRow>(
        `SELECT plan_code AS "planCode", status::text AS status,
                dashboard_access_enabled AS "dashboardAccess",
                report_exports_enabled AS "reportExports",
                basic_branding_enabled AS "basicBranding"
         FROM organization_subscriptions
         WHERE organization_id = $1`,
        [scope.organizationId],
      );
      await recordAdminActivityInTransaction(transaction, context);
      const row = result.rows[0];
      return {
        organizationId: scope.organizationId,
        subscription:
          row === undefined
            ? null
            : {
                entitlements: {
                  basicBranding: row.basicBranding,
                  dashboardAccess: row.dashboardAccess,
                  reportExports: row.reportExports,
                },
                planCode: row.planCode,
                status: row.status,
              },
      };
    });
  }
}
