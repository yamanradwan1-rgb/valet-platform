import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { formatExactCurrency } from "./intelligence-format";
import type {
  PaymentsCurrentPresentation,
  PaymentsPeriodPresentation,
} from "./payments-presentation";
import { paymentsCopy } from "./payments-copy";
import styles from "./payments-breakdown.module.css";

export function PaymentsBreakdownTable(props: {
  readonly current: PaymentsCurrentPresentation | null;
  readonly currentError: string | null;
  readonly currentLoading: boolean;
  readonly locale: DashboardLocale;
  readonly mode: "COMPANY" | "LOCATION";
  readonly onRetryCurrent: () => void;
  readonly onRetryPeriod: () => void;
  readonly period: PaymentsPeriodPresentation | null;
  readonly periodError: string | null;
  readonly periodLoading: boolean;
  readonly periodSelected: boolean;
}) {
  const t = paymentsCopy(props.locale);
  return (
    <section className={styles.breakdownPanel}>
      <div className={styles.breakdownHeader}>
        <h2>{t.breakdown}</h2>
      </div>
      <section className={styles.breakdownSection} aria-labelledby="period-financial-heading">
        <h3 id="period-financial-heading">{t.periodFinancial}</h3>
        <PeriodTable {...props} />
      </section>
      <ValidationSummary {...props} />
      <CashTable {...props} />
      {props.mode === "LOCATION" ? <CurrentTable {...props} /> : null}
      {props.mode === "COMPANY" && props.period?.companyCoverage ? (
        <Coverage coverage={props.period.companyCoverage} locale={props.locale} />
      ) : null}
    </section>
  );
}

function PeriodTable(props: Parameters<typeof PaymentsBreakdownTable>[0]) {
  const t = paymentsCopy(props.locale);
  if (!props.periodSelected) return <State message={t.periodRequired} />;
  if (props.periodLoading) return <State message={t.loading} />;
  if (props.periodError) {
    return <State message={props.periodError} onRetry={props.onRetryPeriod} retry={t.retry} />;
  }
  if (!props.period || props.period.currencies.length === 0) return <State message={t.noPeriod} />;
  return (
    <div className={styles.tableWrap}>
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
              <td><BidiText>{group.currency}</BidiText></td>
              <Money value={group.collectedAmountTotal} currency={group.currency} locale={props.locale} />
              <td><BidiText kind="number">{group.paidPaymentCount}</BidiText></td>
              <Money value={group.tipAmountTotal} currency={group.currency} locale={props.locale} />
              <Money value={group.succeededRefundAmountTotal} currency={group.currency} locale={props.locale} />
              <Money value={group.currentValidationAmountTotal} currency={group.currency} locale={props.locale} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValidationSummary(props: Parameters<typeof PaymentsBreakdownTable>[0]) {
  const t = paymentsCopy(props.locale);
  return (
    <section className={styles.validationSection} aria-labelledby="validation-summary-heading">
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
        <div className={styles.tableWrap}>
          <table className={[styles.table, styles.validationTable].join(" ")}>
            <thead>
              <tr><th>{t.currency}</th><th>{t.validationRate}</th><th>{t.currentValidation}</th></tr>
            </thead>
            <tbody>
              {props.period.currencies.map((group) => (
                <tr key={group.currency}>
                  <td><BidiText>{group.currency}</BidiText></td>
                  <td>
                    {group.validationRate.percentage === null ? t.unavailable : (
                      <BidiText kind="number">
                        {group.validationRate.percentage}% ({group.validationRate.numerator}/{group.validationRate.denominator})
                      </BidiText>
                    )}
                  </td>
                  <Money value={group.currentValidationAmountTotal} currency={group.currency} locale={props.locale} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CashTable(props: Parameters<typeof PaymentsBreakdownTable>[0]) {
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
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>{t.currency}</th><th>{t.expected}</th><th>{t.reported}</th><th>{t.variance}</th></tr>
            </thead>
            <tbody>
              {props.period.cashReconciliation.map((entry) => (
                <tr key={entry.currency}>
                  <td><BidiText>{entry.currency}</BidiText></td>
                  <Money value={entry.cashExpectedTotal} currency={entry.currency} locale={props.locale} />
                  <Money value={entry.cashReportedTotal} currency={entry.currency} locale={props.locale} />
                  <Money value={entry.cashVarianceTotal} currency={entry.currency} locale={props.locale} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CurrentTable(props: Parameters<typeof PaymentsBreakdownTable>[0]) {
  const t = paymentsCopy(props.locale);
  return (
    <section className={styles.breakdownSection} aria-labelledby="current-financial-heading">
      <h3 id="current-financial-heading">{t.currentFinancial}</h3>
      <p className={styles.sectionContext}>{t.currentFinancialContext}</p>
      {props.currentLoading ? (
        <State message={t.loading} compact />
      ) : props.currentError ? (
        <State message={props.currentError} onRetry={props.onRetryCurrent} retry={t.retry} compact />
      ) : !props.current || props.current.currencies.length === 0 ? (
        <State message={t.noCurrent} compact />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.currency}</th><th>{t.paymentCount}</th><th>{t.amountDue}</th>
                <th>{t.amountPaid}</th><th>{t.tips}</th><th>{t.refunds}</th>
                <th>{t.currentValidation}</th><th>{t.collectionMethods}</th><th>{t.statuses}</th>
              </tr>
            </thead>
            <tbody>
              {props.current.currencies.map((group) => (
                <tr key={group.currency}>
                  <td><BidiText>{group.currency}</BidiText></td>
                  <td><BidiText kind="number">{group.paymentCount}</BidiText></td>
                  <Money value={group.amountDueTotal} currency={group.currency} locale={props.locale} />
                  <Money value={group.amountPaidTotal} currency={group.currency} locale={props.locale} />
                  <Money value={group.tipAmountTotal} currency={group.currency} locale={props.locale} />
                  <Money value={group.succeededRefundAmountTotal} currency={group.currency} locale={props.locale} />
                  <Money value={group.currentValidationAmountTotal} currency={group.currency} locale={props.locale} />
                  <td>{group.collectionMethodCounts.map((item) => <Count key={item.method} code={item.method} count={item.count} />)}</td>
                  <td>{group.statusCounts.map((item) => <Count key={item.status} code={item.status} count={item.count} />)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Coverage(props: {
  readonly coverage: NonNullable<PaymentsPeriodPresentation["companyCoverage"]>;
  readonly locale: DashboardLocale;
}) {
  const t = paymentsCopy(props.locale);
  return (
    <section className={styles.coverageBand} aria-label={t.companyCoverage}>
      <strong>{t.companyCoverage}</strong>
      <span>{t.totalLocations}: <BidiText kind="number">{props.coverage.totalLocationCount}</BidiText></span>
      <span>{t.activeLocations}: <BidiText kind="number">{props.coverage.activeLocationCount}</BidiText></span>
      <span>{t.inactiveLocations}: <BidiText kind="number">{props.coverage.inactiveLocationCount}</BidiText></span>
    </section>
  );
}

function Money(props: { readonly currency: string; readonly locale: DashboardLocale; readonly value: string }) {
  return <td className={styles.money}><BidiText kind="number">{formatExactCurrency(props.value, props.currency, props.locale)}</BidiText></td>;
}

function Count({ code, count }: { readonly code: string; readonly count: number }) {
  return <span className={styles.countItem}><BidiText>{code}</BidiText> <BidiText kind="number">{count}</BidiText></span>;
}

function State(props: {
  readonly compact?: boolean;
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retry?: string;
}) {
  return (
    <div className={props.compact ? styles.compactState : styles.panelState} role={props.onRetry ? "alert" : "status"}>
      <span>{props.message}</span>
      {props.onRetry && props.retry ? <button className={styles.retryButton} onClick={props.onRetry} type="button">{props.retry}</button> : null}
    </div>
  );
}
