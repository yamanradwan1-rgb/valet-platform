import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import {
  PeriodTable,
  ValidationSummary,
  CashTable,
} from "./payments-period-tables";
import { CurrentTable } from "./payments-current-table";
import type { PaymentsPeriodPresentation } from "./payments-presentation";
import type { PaymentsBreakdownProps } from "./payments-breakdown-types";
import { paymentsCopy } from "./payments-copy";
import styles from "./payments-breakdown.module.css";

export function PaymentsBreakdownTable(props: PaymentsBreakdownProps) {
  const t = paymentsCopy(props.locale);
  return (
    <section className={styles.breakdownPanel}>
      <div className={styles.breakdownHeader}>
        <h2>{t.breakdown}</h2>
      </div>
      <section
        className={styles.breakdownSection}
        aria-labelledby="period-financial-heading"
      >
        <h3 id="period-financial-heading">{t.periodFinancial}</h3>
        <PeriodTable {...props} />
      </section>
      <ValidationSummary {...props} />
      <CashTable {...props} />
      {props.mode === "LOCATION" ? <CurrentTable {...props} /> : null}
      {props.mode === "COMPANY" && props.period?.companyCoverage ? (
        <Coverage
          coverage={props.period.companyCoverage}
          locale={props.locale}
        />
      ) : null}
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
      <span>
        {t.totalLocations}:{" "}
        <BidiText kind="number">{props.coverage.totalLocationCount}</BidiText>
      </span>
      <span>
        {t.activeLocations}:{" "}
        <BidiText kind="number">{props.coverage.activeLocationCount}</BidiText>
      </span>
      <span>
        {t.inactiveLocations}:{" "}
        <BidiText kind="number">
          {props.coverage.inactiveLocationCount}
        </BidiText>
      </span>
    </section>
  );
}
