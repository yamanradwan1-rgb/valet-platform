import type { CompanyAnalyticsSummary } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { companyLocationBoundsCte } from "./company-analytics-bounds";

interface FinancialRow {
  readonly cashGroupCount: number;
  readonly cashReconciliation: CompanyAnalyticsSummary["financial"]["cashReconciliation"];
  readonly currencies: CompanyAnalyticsSummary["financial"]["currencies"];
  readonly currencyGroupCount: number;
}

export interface CompanyFinancialQueryResult {
  readonly cashGroupCount: number;
  readonly currencyGroupCount: number;
  readonly data: CompanyAnalyticsSummary["financial"];
}

export async function queryCompanyFinancial(
  transaction: PostgresTransaction,
  parameters: readonly [string, string, string],
): Promise<CompanyFinancialQueryResult> {
  const result = await transaction.query<FinancialRow>(
    `WITH ${companyLocationBoundsCte()}, paid AS (
       SELECT p.currency,
              count(*)::int AS paid_count,
              SUM(p.amount_paid) AS collected_total,
              SUM(p.tip_amount) AS tip_total,
              count(*) FILTER (WHERE p.collection_method = 'DIGITAL')::int AS digital_count,
              count(*) FILTER (WHERE p.collection_method IN ('CASH','DIGITAL'))::int AS cash_digital_count
       FROM payments AS p
       INNER JOIN valet_sessions AS s
         ON s.organization_id = p.organization_id
        AND s.location_id = p.location_id
        AND s.id = p.valet_session_id
       INNER JOIN location_bounds AS b ON b.location_id = p.location_id
       WHERE p.organization_id = $1 AND p.status = 'PAID'
         AND p.paid_at >= b.period_start AND p.paid_at < b.period_end
       GROUP BY p.currency
     ), refunds AS (
       SELECT p.currency, SUM(r.amount) AS refund_total
       FROM refunds AS r
       INNER JOIN payments AS p
         ON p.organization_id = r.organization_id AND p.id = r.payment_id
       INNER JOIN valet_sessions AS s
         ON s.organization_id = p.organization_id
        AND s.location_id = p.location_id
        AND s.id = p.valet_session_id
       INNER JOIN location_bounds AS b ON b.location_id = p.location_id
       WHERE p.organization_id = $1 AND r.status = 'SUCCEEDED'
         AND r.completed_at >= b.period_start AND r.completed_at < b.period_end
       GROUP BY p.currency
     ), validations AS (
       SELECT p.currency,
              count(DISTINCT p.id)::int AS cohort_count,
              count(DISTINCT v.payment_id)::int AS validated_count,
              COALESCE(SUM(v.amount) FILTER (WHERE v.id IS NOT NULL), 0::numeric) AS validation_total
       FROM payments AS p
       INNER JOIN valet_sessions AS s
         ON s.organization_id = p.organization_id
        AND s.location_id = p.location_id
        AND s.id = p.valet_session_id
       INNER JOIN location_bounds AS b ON b.location_id = p.location_id
       LEFT JOIN validations AS v
         ON v.organization_id = p.organization_id
        AND v.payment_id = p.id
        AND v.is_current
        AND v.mode IN ('FULL','PARTIAL')
       WHERE p.organization_id = $1
         AND s.completed_at >= b.period_start AND s.completed_at < b.period_end
       GROUP BY p.currency
     ), currency_keys AS (
       SELECT currency FROM paid
       UNION SELECT currency FROM refunds
       UNION SELECT currency FROM validations
     ), currency_rows AS (
       SELECT key.currency,
              COALESCE(paid.paid_count, 0) AS paid_count,
              COALESCE(paid.collected_total, 0::numeric) AS collected_total,
              COALESCE(paid.tip_total, 0::numeric) AS tip_total,
              COALESCE(paid.digital_count, 0) AS digital_count,
              COALESCE(paid.cash_digital_count, 0) AS cash_digital_count,
              COALESCE(refunds.refund_total, 0::numeric) AS refund_total,
              COALESCE(validations.cohort_count, 0) AS validation_cohort_count,
              COALESCE(validations.validated_count, 0) AS validated_count,
              COALESCE(validations.validation_total, 0::numeric) AS validation_total
       FROM currency_keys AS key
       LEFT JOIN paid USING (currency)
       LEFT JOIN refunds USING (currency)
       LEFT JOIN validations USING (currency)
     ), cash_rows AS (
       SELECT shift.cash_currency AS currency,
              SUM(shift.cash_expected) AS expected_total,
              SUM(shift.cash_reported) AS reported_total,
              SUM(shift.cash_variance) AS variance_total
       FROM shifts AS shift
       INNER JOIN location_bounds AS b ON b.location_id = shift.location_id
       WHERE shift.organization_id = $1 AND shift.status = 'ENDED'
         AND shift.ended_at >= b.period_start AND shift.ended_at < b.period_end
         AND shift.cash_expected IS NOT NULL
       GROUP BY shift.cash_currency
     ), counts AS (
       SELECT (SELECT count(*)::int FROM currency_rows) AS "currencyGroupCount",
              (SELECT count(*)::int FROM cash_rows) AS "cashGroupCount"
     )
     SELECT counts."currencyGroupCount", counts."cashGroupCount",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'currency', currency,
                'paidPaymentCount', paid_count,
                'collectedAmountTotal', collected_total::numeric(20,3)::text,
                'tipAmountTotal', tip_total::numeric(20,3)::text,
                'digitalPaymentRate', jsonb_build_object(
                  'numerator', digital_count,
                  'denominator', cash_digital_count,
                  'percentage', CASE WHEN cash_digital_count = 0 THEN NULL
                    ELSE (digital_count::numeric * 100 / cash_digital_count::numeric)::numeric(20,2)::text END),
                'succeededRefundAmountTotal', refund_total::numeric(20,3)::text,
                'validationRate', jsonb_build_object(
                  'numerator', validated_count,
                  'denominator', validation_cohort_count,
                  'percentage', CASE WHEN validation_cohort_count = 0 THEN NULL
                    ELSE (validated_count::numeric * 100 / validation_cohort_count::numeric)::numeric(20,2)::text END),
                'currentValidationAmountTotal', validation_total::numeric(20,3)::text
              ) ORDER BY currency)
              FROM (SELECT * FROM currency_rows ORDER BY currency LIMIT 501) AS bounded
            ), '[]'::jsonb) AS currencies,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'currency', currency,
                'cashExpectedTotal', expected_total::numeric(20,3)::text,
                'cashReportedTotal', reported_total::numeric(20,3)::text,
                'cashVarianceTotal', variance_total::numeric(20,3)::text
              ) ORDER BY currency)
              FROM (SELECT * FROM cash_rows ORDER BY currency LIMIT 501) AS bounded
            ), '[]'::jsonb) AS "cashReconciliation"
     FROM counts`,
    [...parameters],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Company financial analytics are missing.");
  return {
    cashGroupCount: row.cashGroupCount,
    currencyGroupCount: row.currencyGroupCount,
    data: { cashReconciliation: row.cashReconciliation, currencies: row.currencies },
  };
}
