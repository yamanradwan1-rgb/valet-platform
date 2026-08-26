"use client";

import type {
  CashReconciliationEntry,
  FinancialAnalyticsCurrencyGroup,
  ReportSummary,
} from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { useTranslation } from "../../i18n/locale-provider";

import { formatCurrencyAmount } from "./reports-display";
import { ReportRateCard } from "./reports-metric-cards";

/**
 * Currency and cash reconciliation sections of a loaded report.
 *
 * MONEY RULES (identical to D4-001): every amount is the backend's exact
 * decimal string concatenated with its OWN currency code only. Currencies
 * stay separate groups — never summed, converted or totaled client-side;
 * signed variance strings pass through untouched; rates render verbatim
 * with their numerator/denominator ratio visible.
 */

function currencyFactEntries(
  group: FinancialAnalyticsCurrencyGroup,
  labels: {
    collected: string;
    currentValidationAmount: string;
    paidPayments: string;
    succeededRefunds: string;
    tips: string;
  },
): readonly { readonly label: string; readonly value: string }[] {
  return [
    {
      label: labels.paidPayments,
      value: String(group.paidPaymentCount),
    },
    {
      label: labels.collected,
      value: formatCurrencyAmount(group.currency, group.collectedAmountTotal),
    },
    {
      label: labels.tips,
      value: formatCurrencyAmount(group.currency, group.tipAmountTotal),
    },
    {
      label: labels.succeededRefunds,
      value: formatCurrencyAmount(
        group.currency,
        group.succeededRefundAmountTotal,
      ),
    },
    {
      label: labels.currentValidationAmount,
      value: formatCurrencyAmount(
        group.currency,
        group.currentValidationAmountTotal,
      ),
    },
  ];
}

export function ReportsCurrenciesSection({
  summary,
}: {
  summary: ReportSummary;
}) {
  const { t } = useTranslation();
  return (
    <div className="rep-section-stack">
      <Card>
        <div className="card-section-header">
          <h2>{t("reports.summary.currenciesTitle")}</h2>
        </div>
        {summary.currencies.length === 0 ? (
          <EmptyState message={t("analytics.fin.empty")} />
        ) : (
          <div className="rep-currency-grid">
            {summary.currencies.map((group) => (
              <section
                className="rep-currency-card"
                key={group.currency}
              >
                <h3 className="rep-currency-code">{group.currency}</h3>
                <dl className="rep-fact-list">
                  {currencyFactEntries(group, {
                    collected: t("analytics.fin.collected"),
                    currentValidationAmount: t(
                      "analytics.fin.validatedAmount",
                    ),
                    paidPayments: t("analytics.fin.paidPayments"),
                    succeededRefunds: t("analytics.fin.succeededRefunds"),
                    tips: t("analytics.fin.tips"),
                  }).map((fact) => (
                    <div className="rep-fact-row" key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="rep-rate-grid">
                  <ReportRateCard
                    label={t("analytics.fin.digitalRate")}
                    rate={group.digitalPaymentRate}
                  />
                  <ReportRateCard
                    label={t("analytics.fin.validationRate")}
                    rate={group.validationRate}
                  />
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      <CashReconciliationCard entries={summary.cashReconciliation} />
    </div>
  );
}

function CashReconciliationCard({
  entries,
}: {
  entries: readonly CashReconciliationEntry[];
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="card-section-header">
        <h2>{t("analytics.fin.cashReconciliationTitle")}</h2>
      </div>
      {entries.length === 0 ? (
        <EmptyState message={t("analytics.fin.cashEmpty")} />
      ) : (
        <ul className="rep-cash-list">
          {entries.map((entry) => (
            <li className="rep-cash-row" key={entry.currency}>
              <span className="rep-cash-currency">{entry.currency}</span>
              <span className="rep-cash-cell">
                <span className="rep-cash-label">
                  {t("analytics.fin.cashExpected")}
                </span>
                <span className="rep-cash-value">
                  {formatCurrencyAmount(entry.currency, entry.cashExpectedTotal)}
                </span>
              </span>
              <span className="rep-cash-cell">
                <span className="rep-cash-label">
                  {t("analytics.fin.cashReported")}
                </span>
                <span className="rep-cash-value">
                  {formatCurrencyAmount(entry.currency, entry.cashReportedTotal)}
                </span>
              </span>
              <span className="rep-cash-cell">
                <span className="rep-cash-label">
                  {t("analytics.fin.cashVariance")}
                </span>
                <span className="rep-cash-value">
                  {formatCurrencyAmount(entry.currency, entry.cashVarianceTotal)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
