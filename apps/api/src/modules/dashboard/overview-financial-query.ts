import type { FinancialOverviewResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
import { assertAuthorized } from "./dashboard-overview-error";

interface PaymentGroupRow {
  readonly amountDueTotal: string;
  readonly amountPaidTotal: string;
  readonly cashCount: number;
  readonly currency: string;
  readonly digitalCount: number;
  readonly failedCount: number;
  readonly notRequiredCount: number;
  readonly notRequiredStatusCount: number;
  readonly paidCount: number;
  readonly paymentCount: number;
  readonly pendingCount: number;
  readonly tipAmountTotal: string;
  readonly unpaidCount: number;
}

interface CurrencyTotalRow {
  readonly currency: string;
  readonly total: string;
}

const sessionScopeJoin = `
     FROM payments AS payment
     INNER JOIN valet_sessions AS session
       ON session.organization_id = payment.organization_id
      AND session.location_id = payment.location_id
      AND session.id = payment.valet_session_id
      AND session.state <> 'COMPLETED'
`;
const paymentScopePredicate = `WHERE payment.organization_id = $1
       AND payment.location_id = $2`;

export async function financialOperationalOverview(
  pool: PostgresPool,
  input: { authenticatedUserId: string; locationId: string },
): Promise<FinancialOverviewResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    assertAuthorized(scope);
    const parameters = [scope.organizationId, input.locationId];
    const paymentGroups = await transaction.query<PaymentGroupRow>(
      `SELECT payment.currency,
              count(*)::int AS "paymentCount",
              COALESCE(SUM(payment.amount_due), 0)::text AS "amountDueTotal",
              COALESCE(SUM(payment.amount_paid), 0)::text
                AS "amountPaidTotal",
              COALESCE(SUM(payment.tip_amount), 0)::text
                AS "tipAmountTotal",
              count(*) FILTER (WHERE payment.collection_method = 'NONE')
                ::int AS "notRequiredCount",
              count(*) FILTER (WHERE payment.collection_method = 'CASH')
                ::int AS "cashCount",
              count(*) FILTER (WHERE payment.collection_method = 'DIGITAL')
                ::int AS "digitalCount",
              count(*) FILTER (WHERE payment.status = 'NOT_REQUIRED')
                ::int AS "notRequiredStatusCount",
              count(*) FILTER (WHERE payment.status = 'UNPAID')
                ::int AS "unpaidCount",
              count(*) FILTER (WHERE payment.status = 'PENDING')
                ::int AS "pendingCount",
              count(*) FILTER (WHERE payment.status = 'PAID')
                ::int AS "paidCount",
              count(*) FILTER (WHERE payment.status = 'FAILED')
                ::int AS "failedCount"
       ${sessionScopeJoin}${paymentScopePredicate}
       GROUP BY payment.currency`,
      parameters,
    );
    const refundTotals = await transaction.query<CurrencyTotalRow>(
      `SELECT payment.currency, COALESCE(SUM(refund.amount), 0)::text AS total
       ${sessionScopeJoin}
       INNER JOIN refunds AS refund
         ON refund.organization_id = payment.organization_id
        AND refund.payment_id = payment.id
        AND refund.status = 'SUCCEEDED'
       ${paymentScopePredicate}
       GROUP BY payment.currency`,
      parameters,
    );
    const validationTotals = await transaction.query<CurrencyTotalRow>(
      `SELECT payment.currency, COALESCE(SUM(validation.amount), 0)::text AS total
       ${sessionScopeJoin}
       INNER JOIN validations AS validation
         ON validation.organization_id = payment.organization_id
        AND validation.payment_id = payment.id
        AND validation.is_current
       ${paymentScopePredicate}
         AND validation.mode <> 'NONE'
       GROUP BY payment.currency`,
      parameters,
    );
    const refundByCurrency = new Map(
      refundTotals.rows.map((row) => [row.currency, row.total]),
    );
    const validationByCurrency = new Map(
      validationTotals.rows.map((row) => [row.currency, row.total]),
    );
    return {
      currencies: paymentGroups.rows
        .slice()
        .sort((left, right) => left.currency.localeCompare(right.currency))
        .map((row) => ({
          amountDueTotal: row.amountDueTotal,
          amountPaidTotal: row.amountPaidTotal,
          collectionMethodCounts: [
            { count: row.notRequiredCount, method: "NONE" as const },
            { count: row.cashCount, method: "CASH" as const },
            { count: row.digitalCount, method: "DIGITAL" as const },
          ],
          currency: row.currency,
          currentValidationAmountTotal:
            validationByCurrency.get(row.currency) ?? "0.000",
          paymentCount: row.paymentCount,
          statusCounts: [
            {
              count: row.notRequiredStatusCount,
              status: "NOT_REQUIRED" as const,
            },
            { count: row.unpaidCount, status: "UNPAID" as const },
            { count: row.pendingCount, status: "PENDING" as const },
            { count: row.paidCount, status: "PAID" as const },
            { count: row.failedCount, status: "FAILED" as const },
          ],
          succeededRefundAmountTotal:
            refundByCurrency.get(row.currency) ?? "0.000",
          tipAmountTotal: row.tipAmountTotal,
        })),
    };
  });
}
