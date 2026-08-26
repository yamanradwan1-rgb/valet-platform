"use client";

import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { useTranslation } from "../../i18n/locale-provider";
import { formatCurrencyAmount } from "./analytics-display";
import type { AnalyticsComposition } from "./analytics-api";
import { AnalyticsMetric, AnalyticsRateCard } from "./analytics-metric-cards";

/**
 * Financial tab: per-currency analytics groups plus backend cash
 * reconciliation.
 *
 * MONEY PRECISION: collected/tip/refund/validation amounts are exact decimal
 * strings concatenated with their own currency code only — never parsed,
 * never summed across currencies, never converted. digitalPaymentRate and
 * validationRate are BACKEND-computed: the string percentage renders
 * verbatim (null → honest em dash) with numerator/denominator shown as
 * context; no frontend formula recomputes any rate. Cash reconciliation
 * expected/reported/variance signed strings render exactly as received and
 * variance is never recalculated client-side.
 */

export function AnalyticsFinancialSection({
  composition,
}: {
  composition: AnalyticsComposition;
}) {
  const { t } = useTranslation();
  const currencies = composition.financial.currencies;
  const cash = composition.financial.cashReconciliation;

  return (
    <div className="ana-section-stack">
      {currencies.length === 0 ? (
        <EmptyState message={t("analytics.fin.empty")} />
      ) : null}
      {currencies.map((group) => (
        <Card key={group.currency}>
          <div className="card-section-header">
            <h2>{`${t("analytics.fin.currencyGroupLabel")} · ${group.currency}`}</h2>
          </div>
          <div className="ana-metric-grid ana-metric-grid-4">
            <AnalyticsMetric
              label={t("analytics.fin.paidPayments")}
              value={String(group.paidPaymentCount)}
            />
            <AnalyticsMetric
              label={t("analytics.fin.collected")}
              value={formatCurrencyAmount(
                group.currency,
                group.collectedAmountTotal,
              )}
            />
            <AnalyticsMetric
              label={t("analytics.fin.tips")}
              value={formatCurrencyAmount(group.currency, group.tipAmountTotal)}
            />
            <AnalyticsMetric
              label={t("analytics.fin.succeededRefunds")}
              value={formatCurrencyAmount(
                group.currency,
                group.succeededRefundAmountTotal,
              )}
            />
          </div>
          <div className="ana-rate-grid">
            <AnalyticsRateCard
              label={t("analytics.fin.digitalRate")}
              rate={group.digitalPaymentRate}
            />
            <AnalyticsRateCard
              extra={`${t("analytics.fin.validatedAmount")}: ${formatCurrencyAmount(group.currency, group.currentValidationAmountTotal)}`}
              label={t("analytics.fin.validationRate")}
              rate={group.validationRate}
            />
          </div>
        </Card>
      ))}
      <Card>
        <div className="card-section-header">
          <h2>{t("analytics.fin.cashReconciliationTitle")}</h2>
        </div>
        {cash.length === 0 ? (
          <EmptyState message={t("analytics.fin.cashEmpty")} />
        ) : (
          <ul className="ana-cash-list">
            {cash.map((entry) => (
              <li className="ana-cash-row" key={entry.currency}>
                <AnalyticsMetric
                  label={t("analytics.fin.cashCurrency")}
                  value={entry.currency}
                />
                <AnalyticsMetric
                  label={t("analytics.fin.cashExpected")}
                  value={entry.cashExpectedTotal}
                />
                <AnalyticsMetric
                  label={t("analytics.fin.cashReported")}
                  value={entry.cashReportedTotal}
                />
                <AnalyticsMetric
                  label={t("analytics.fin.cashVariance")}
                  value={entry.cashVarianceTotal}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
