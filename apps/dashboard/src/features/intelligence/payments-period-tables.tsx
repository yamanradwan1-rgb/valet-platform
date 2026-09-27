import { BidiText } from "../../components/presentation/panel";
import { paymentsCopy } from "./payments-copy";
import type { PaymentsBreakdownProps } from "./payments-breakdown-types";
import {
  Money,
  State,
  FinancialTable,
  RateEvidence,
} from "./payments-table-primitives";
import styles from "./payments-breakdown.module.css";

export function PeriodTable(props: PaymentsBreakdownProps) {
  const t = paymentsCopy(props.locale);
  if (!props.periodSelected) return <State message={t.periodRequired} />;
  if (props.periodLoading) return <State message={t.loading} />;
  if (props.periodError) {
    return (
      <State
        message={props.periodError}
        onRetry={props.onRetryPeriod}
        retry={t.retry}
      />
    );
  }
  if (!props.period || props.period.currencies.length === 0)
    return <State message={t.noPeriod} />;
  return (
    <FinancialTable label={t.periodFinancial}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t.currency}</th>
            <th>{t.collected}</th>
            <th>{t.paidPayments}</th>
            <th>{t.tips}</th>
            <th>{t.refunds}</th>
            <th>{t.currentValidation}</th>
          </tr>
        </thead>
        <tbody>
          {props.period.currencies.map((group) => (
            <tr key={group.currency}>
              <td>
                <BidiText>{group.currency}</BidiText>
              </td>
              <Money
                value={group.collectedAmountTotal}
                currency={group.currency}
                locale={props.locale}
              />
              <td>
                <BidiText kind="number">{group.paidPaymentCount}</BidiText>
              </td>
              <Money
                value={group.tipAmountTotal}
                currency={group.currency}
                locale={props.locale}
              />
              <Money
                value={group.succeededRefundAmountTotal}
                currency={group.currency}
                locale={props.locale}
              />
              <Money
                value={group.currentValidationAmountTotal}
                currency={group.currency}
                locale={props.locale}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </FinancialTable>
  );
}

export function ValidationSummary(props: PaymentsBreakdownProps) {
  const t = paymentsCopy(props.locale);
  return (
    <section
      className={styles.validationSection}
      aria-labelledby="validation-summary-heading"
    >
      <div className={styles.validationTabs}>
        <h3 id="validation-summary-heading">{t.validationSummary}</h3>
      </div>
      {!props.periodSelected ? (
        <State message={t.periodRequired} compact />
      ) : props.periodLoading ? (
        <State message={t.loading} compact />
      ) : props.periodError ? (
        <State message={props.periodError} compact />
      ) : !props.period || props.period.currencies.length === 0 ? (
        <State message={t.noPeriod} compact />
      ) : (
        <FinancialTable label={t.validationSummary}>
          <table className={[styles.table, styles.validationTable].join(" ")}>
            <thead>
              <tr>
                <th>{t.currency}</th>
                <th>{t.validationRate}</th>
                <th>{t.currentValidation}</th>
                <th>{t.digitalEvidence}</th>
              </tr>
            </thead>
            <tbody>
              {props.period.currencies.map((group) => (
                <tr key={group.currency}>
                  <td>
                    <BidiText>{group.currency}</BidiText>
                  </td>
                  <td>
                    <RateEvidence
                      rate={group.validationRate}
                      unavailable={t.unavailable}
                    />
                  </td>
                  <Money
                    value={group.currentValidationAmountTotal}
                    currency={group.currency}
                    locale={props.locale}
                  />
                  <td>
                    <RateEvidence
                      rate={group.digitalPaymentRate}
                      unavailable={t.unavailable}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FinancialTable>
      )}
    </section>
  );
}

export function CashTable(props: PaymentsBreakdownProps) {
  const t = paymentsCopy(props.locale);
  return (
    <section className={styles.breakdownSection} aria-labelledby="cash-heading">
      <h3 id="cash-heading">{t.cashReconciliation}</h3>
      {!props.periodSelected ? (
        <State message={t.periodRequired} compact />
      ) : props.periodLoading ? (
        <State message={t.loading} compact />
      ) : props.periodError ? (
        <State message={props.periodError} compact />
      ) : !props.period || props.period.cashReconciliation.length === 0 ? (
        <State message={t.noCash} compact />
      ) : (
        <FinancialTable label={t.cashReconciliation}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.currency}</th>
                <th>{t.expected}</th>
                <th>{t.reported}</th>
                <th>{t.variance}</th>
              </tr>
            </thead>
            <tbody>
              {props.period.cashReconciliation.map((entry) => (
                <tr key={entry.currency}>
                  <td>
                    <BidiText>{entry.currency}</BidiText>
                  </td>
                  <Money
                    value={entry.cashExpectedTotal}
                    currency={entry.currency}
                    locale={props.locale}
                  />
                  <Money
                    value={entry.cashReportedTotal}
                    currency={entry.currency}
                    locale={props.locale}
                  />
                  <Money
                    value={entry.cashVarianceTotal}
                    currency={entry.currency}
                    locale={props.locale}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </FinancialTable>
      )}
    </section>
  );
}
