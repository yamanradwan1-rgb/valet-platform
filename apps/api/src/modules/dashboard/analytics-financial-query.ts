import type {
  AnalyticsRate,
  FinancialAnalyticsResponse,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import type { AnalyticsPeriod } from "./analytics-period";
import {
  analyticsWindowCte,
  resolveAnalyticsTimezone,
} from "./analytics-period";

interface PaidGroupRow {
  readonly cashOrDigitalCount: number;
  readonly collectedAmountTotal: string;
  readonly currency: string;
  readonly digitalCount: number;
  readonly paidPaymentCount: number;
  readonly tipAmountTotal: string;
}

interface CurrencyTotalRow {
  readonly currency: string;
  readonly total: string;
}

interface ValidationGroupRow {
  readonly cohortCount: number;
  readonly currency: string;
  readonly currentValidationAmountTotal: string;
  readonly validatedCount: number;
}

interface CashRow {
  readonly cashExpectedTotal: string;
  readonly cashCurrency: string;
  readonly cashReportedTotal: string;
  readonly cashVarianceTotal: string;
}

export function analyticsPercentage(
  numerator: number,
  denominator: number,
): string | null {
  if (denominator === 0) return null;
  const scaled = (BigInt(numerator) * 10_000n * 2n + BigInt(denominator)) /
    (BigInt(denominator) * 2n);
  return `${scaled / 100n}.${(scaled % 100n).toString().padStart(2, "0")}`;
}

const sessionScope = `
     FROM payments AS p
     INNER JOIN valet_sessions AS s
       ON s.organization_id = p.organization_id
      AND s.location_id = p.location_id
      AND s.id = p.valet_session_id
`;

export async function financialAnalytics(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    locationId: string;
    period: AnalyticsPeriod;
  },
): Promise<FinancialAnalyticsResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    assertAuthorized(scope);
    const timezone = await resolveAnalyticsTimezone(transaction, scope);
    const parameters = [scope.organizationId, input.locationId];
    parameters.push(input.period.from, input.period.to, timezone);
    const windowCte = analyticsWindowCte(3, 4, 5);
    const paidGroups = await transaction.query<PaidGroupRow>(
      `SELECT p.currency,
              count(*)::int AS "paidPaymentCount",
              SUM(p.amount_paid)::text AS "collectedAmountTotal",
              SUM(p.tip_amount)::text AS "tipAmountTotal",
              count(*) FILTER (
                WHERE p.collection_method = 'DIGITAL')::int
                AS "digitalCount",
              count(*) FILTER (
                WHERE p.collection_method IN ('CASH','DIGITAL'))::int
                AS "cashOrDigitalCount"
       ${sessionScope}
       ${windowCte}
       WHERE p.organization_id = $1 AND p.location_id = $2
         AND p.status = 'PAID'
         AND p.paid_at >= bounds.period_start
         AND p.paid_at < bounds.period_end
       GROUP BY p.currency`,
      parameters,
    );
    const refunds = await transaction.query<CurrencyTotalRow>(
      `SELECT p.currency, COALESCE(SUM(r.amount), 0)::text AS total
       FROM refunds AS r
       INNER JOIN payments AS p
         ON p.organization_id = r.organization_id
        AND p.id = r.payment_id
       INNER JOIN valet_sessions AS s
         ON s.organization_id = p.organization_id
        AND s.location_id = p.location_id
        AND s.id = p.valet_session_id
       ${windowCte}
       WHERE p.organization_id = $1 AND p.location_id = $2
         AND r.status = 'SUCCEEDED'
         AND r.completed_at >= bounds.period_start
         AND r.completed_at < bounds.period_end
       GROUP BY p.currency`,
      parameters,
    );
    const validations = await transaction.query<ValidationGroupRow>(
      `SELECT p.currency,
              count(DISTINCT p.id)::int AS "cohortCount",
              count(DISTINCT v.payment_id)::int AS "validatedCount",
              COALESCE(SUM(v.amount) FILTER (WHERE v.id IS NOT NULL),
                       0::numeric(14,3))::text
                 AS "currentValidationAmountTotal"
       ${sessionScope}
       LEFT JOIN validations AS v
         ON v.organization_id = p.organization_id
        AND v.payment_id = p.id
        AND v.is_current
        AND v.mode IN ('FULL','PARTIAL')
       ${windowCte}
       WHERE p.organization_id = $1 AND p.location_id = $2
         AND s.completed_at >= bounds.period_start
         AND s.completed_at < bounds.period_end
       GROUP BY p.currency`,
      parameters,
    );
    const cash = await transaction.query<CashRow>(
      `SELECT shift.cash_currency AS "cashCurrency",
              SUM(shift.cash_expected)::text AS "cashExpectedTotal",
              SUM(shift.cash_reported)::text AS "cashReportedTotal",
              SUM(shift.cash_variance)::text AS "cashVarianceTotal"
       FROM shifts AS shift
       ${windowCte}
       WHERE shift.organization_id = $1 AND shift.location_id = $2
         AND shift.status = 'ENDED'
         AND shift.ended_at >= bounds.period_start
         AND shift.ended_at < bounds.period_end
         AND shift.cash_expected IS NOT NULL
       GROUP BY shift.cash_currency`,
      parameters,
    );
    const refundByCurrency = new Map(
      refunds.rows.map((row) => [row.currency, row.total] as const),
    );
    const validationByCurrency = new Map(
      validations.rows.map((row) => [row.currency, row] as const),
    );
    return {
      cashReconciliation: cash.rows
        .slice()
        .sort((left, right) =>
          left.cashCurrency.localeCompare(right.cashCurrency),
        )
        .map((row) => ({
          cashExpectedTotal: row.cashExpectedTotal,
          cashReportedTotal: row.cashReportedTotal,
          cashVarianceTotal: row.cashVarianceTotal,
          currency: row.cashCurrency,
        })),
      currencies: paidGroups.rows
        .slice()
        .sort((left, right) => left.currency.localeCompare(right.currency))
        .map((row) => {
          const validation = validationByCurrency.get(row.currency);
          const digitalPaymentRate: AnalyticsRate = {
            denominator: row.cashOrDigitalCount,
            numerator: row.digitalCount,
            percentage: analyticsPercentage(
              row.digitalCount,
              row.cashOrDigitalCount,
            ),
          };
          const validationDenominator =
            validation?.cohortCount ?? 0;
          const validationNumerator = validation?.validatedCount ?? 0;
          const validationRate: AnalyticsRate = {
            denominator: validationDenominator,
            numerator: validationNumerator,
            percentage: analyticsPercentage(
              validationNumerator,
              validationDenominator,
            ),
          };
          return {
            collectedAmountTotal: row.collectedAmountTotal,
            currency: row.currency,
            currentValidationAmountTotal:
              validation?.currentValidationAmountTotal ?? "0.000",
            digitalPaymentRate,
            paidPaymentCount: row.paidPaymentCount,
            succeededRefundAmountTotal:
              refundByCurrency.get(row.currency) ?? "0.000",
            tipAmountTotal: row.tipAmountTotal,
            validationRate,
          };
        }),
      from: input.period.from,
      locationId: scope.locationId,
      timezone,
      to: input.period.to,
    };
  });
}
