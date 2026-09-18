import type { CompanyAnalyticsSummary } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { queryCompanyCoverage } from "./company-analytics-coverage-query";
import { queryCompanyFinancial } from "./company-analytics-financial-query";
import { queryCompanyIncidents } from "./company-analytics-incidents-query";
import { queryCompanyKpis } from "./company-analytics-kpi-query";
import { queryCompanyOperations } from "./company-analytics-operations-query";

export const COMPANY_ANALYTICS_SOURCE_QUERY_COUNT = 5;
const maximumGroupRows = 500;

export class CompanyAnalyticsGroupLimitError extends Error {
  readonly code = "COMPANY_ANALYTICS_TOO_LARGE";

  constructor(label: string) {
    super(`Company analytics ${label} exceeds the allowed group bound.`);
    this.name = "CompanyAnalyticsGroupLimitError";
  }
}

function assertBounded(groupCount: number, label: string): void {
  if (groupCount > maximumGroupRows) {
    throw new CompanyAnalyticsGroupLimitError(label);
  }
}

export async function composeCompanyAnalyticsSources(
  transaction: PostgresTransaction,
  input: {
    readonly from: string;
    readonly organizationId: string;
    readonly to: string;
  },
): Promise<CompanyAnalyticsSummary> {
  const parameters = [input.organizationId, input.from, input.to] as const;

  const coverage = await queryCompanyCoverage(transaction, parameters);
  assertBounded(coverage.timezoneGroupCount, "timezone coverage");

  const operational = await queryCompanyOperations(transaction, parameters);

  const financial = await queryCompanyFinancial(transaction, parameters);
  assertBounded(financial.currencyGroupCount, "currency");
  assertBounded(financial.cashGroupCount, "cash currency");

  const incidents = await queryCompanyIncidents(transaction, parameters);
  assertBounded(incidents.typeGroupCount, "incident type");

  const kpis = await queryCompanyKpis(transaction, parameters);

  return {
    coverage: coverage.data,
    financial: financial.data,
    incidents: incidents.data,
    kpis,
    operational,
  };
}
