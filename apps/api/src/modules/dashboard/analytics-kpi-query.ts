import type { LocationKpiAnalyticsResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { queryKeyExceptions } from "./analytics-kpi-key-exceptions-query";
import { querySlaCompliance } from "./analytics-kpi-sla-query";
import {
  queryCarsPerActiveEmployee,
  queryHandoffEmployees,
  queryHandoffSummary,
} from "./analytics-kpi-workforce-query";
import type { AnalyticsPeriod } from "./analytics-period";
import { resolveAnalyticsTimezone } from "./analytics-period";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";

export async function locationKpiAnalytics(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    locationId: string;
    period: AnalyticsPeriod;
    recordManagementActivity?: boolean;
    staffSessionContext?: StaffSessionContext;
  },
): Promise<LocationKpiAnalyticsResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    await transaction.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      capability: "ANALYTICS_READ",
      recordActivity: input.recordManagementActivity !== false,
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);
    const timezone = await resolveAnalyticsTimezone(transaction, scope);
    const parameters = [
      scope.organizationId,
      input.locationId,
      input.period.from,
      input.period.to,
      timezone,
    ];
    const sla = await querySlaCompliance(transaction, parameters);
    const carsPerActiveEmployee = await queryCarsPerActiveEmployee(
      transaction,
      parameters,
    );
    const handoffSummary = await queryHandoffSummary(transaction, parameters);
    const handoffEmployees = await queryHandoffEmployees(transaction, parameters);
    const keyExceptions = await queryKeyExceptions(transaction, parameters);
    return {
      carsHandedOffByEmployee: {
        ...handoffSummary,
        byEmployee: handoffEmployees.rows,
        truncated: handoffSummary.employeeCount > handoffEmployees.rows.length,
      },
      carsPerActiveEmployee,
      from: input.period.from,
      keyExceptions,
      locationId: scope.locationId,
      slaCompliance: sla,
      timezone,
      to: input.period.to,
    };
  });
}
