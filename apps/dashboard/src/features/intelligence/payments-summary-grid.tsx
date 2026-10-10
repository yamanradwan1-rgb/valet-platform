import { BarChart2, CreditCard, DollarSign, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { BidiText } from "../../components/presentation/panel";
import { ScopedContextHelp } from "../help/scoped-context-help";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { formatExactDecimal } from "./intelligence-format";
import type { PaymentsPeriodPresentation } from "./payments-presentation";
import { paymentsCopy } from "./payments-copy";
import styles from "./payments.module.css";

export function PaymentsSummaryGrid(props: {
  readonly errorMessage: string | null;
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly periodSelected: boolean;
  readonly presentation: PaymentsPeriodPresentation | null;
}) {
  const t = paymentsCopy(props.locale);
  const currencies = props.presentation?.currencies ?? [];
  const state = !props.periodSelected
    ? t.periodRequired
    : props.loading
      ? t.loading
      : (props.errorMessage ?? (currencies.length === 0 ? t.noPeriod : null));

  return (
    <div className={styles.summaryGrid}>
      <SummaryCard helpKey="payments.summary" icon={<DollarSign size={20} />} label={t.collected}>
        <CurrencyValues
          currencies={currencies}
          empty={state}
          locale={props.locale}
          value={(group) => group.collectedAmountTotal}
        />
      </SummaryCard>
      <SummaryCard icon={<CreditCard size={20} />} label={t.paidPayments}>
        <CountValues currencies={currencies} empty={state} />
      </SummaryCard>
      <SummaryCard icon={<BarChart2 size={20} />} label={t.digitalRate}>
        <RateValues
          currencies={currencies}
          empty={state}
          locale={props.locale}
          rate={(group) => group.digitalPaymentRate}
        />
      </SummaryCard>
      <SummaryCard icon={<ShieldCheck size={20} />} label={t.validationRate}>
        <RateValues
          currencies={currencies}
          empty={state}
          locale={props.locale}
          rate={(group) => group.validationRate}
        />
      </SummaryCard>
    </div>
  );
}

type CurrencyGroup = PaymentsPeriodPresentation["currencies"][number];

function SummaryCard(props: {
  readonly children: ReactNode;
  readonly helpKey?: "payments.summary";
  readonly icon: ReactNode;
  readonly label: string;
}) {
  return (
    <section className={styles.summaryCard}>
      <div className={styles.summaryTop}>
        <div className={styles.summaryBody}>
          <div className={styles.summaryValues}>{props.children}</div>
          <div className={styles.summaryLabel}>
            {props.label}
          </div>
          <div aria-hidden="true" className={styles.summaryTrendSpace} />
        </div>
        {props.helpKey ? <ScopedContextHelp helpKey={props.helpKey} /> : null}
        <div className={styles.summaryIcon}>{props.icon}</div>
      </div>
    </section>
  );
}

function CountValues(props: {
  readonly currencies: readonly CurrencyGroup[];
  readonly empty: string | null;
}) {
  if (props.empty)
    return <span className={styles.summaryEmpty}>{props.empty}</span>;
  return (
    <>
      {props.currencies.map((group) => (
        <div className={styles.summaryValueRow} key={group.currency}>
          <BidiText>{group.currency}</BidiText>
          {" · "}
          <BidiText kind="number">{group.paidPaymentCount}</BidiText>
        </div>
      ))}
    </>
  );
}

function CurrencyValues(props: {
  readonly currencies: readonly CurrencyGroup[];
  readonly empty: string | null;
  readonly locale: DashboardLocale;
  readonly value: (group: CurrencyGroup) => string;
}) {
  if (props.empty)
    return <span className={styles.summaryEmpty}>{props.empty}</span>;
  return (
    <>
      {props.currencies.map((group) => (
        <div className={styles.summaryValueRow} key={group.currency}>
          <BidiText kind="number">
            {formatExactDecimal(props.value(group), props.locale)}{" "}
            {group.currency}
          </BidiText>
        </div>
      ))}
    </>
  );
}

function RateValues(props: {
  readonly currencies: readonly CurrencyGroup[];
  readonly empty: string | null;
  readonly locale: DashboardLocale;
  readonly rate: (group: CurrencyGroup) => {
    readonly denominator: number;
    readonly numerator: number;
    readonly percentage: string | null;
  };
}) {
  const t = paymentsCopy(props.locale);
  if (props.empty)
    return <span className={styles.summaryEmpty}>{props.empty}</span>;
  return (
    <>
      {props.currencies.map((group) => {
        const rate = props.rate(group);
        return (
          <div className={styles.summaryRateRow} key={group.currency}>
            <div>
              {rate.percentage === null ? (
                <>
                  <span className={styles.summaryUnavailable}>
                    {t.unavailable}
                  </span>{" "}
                  <BidiText>{group.currency}</BidiText>
                </>
              ) : (
                <BidiText kind="number">
                  {formatExactDecimal(rate.percentage, props.locale)}%{" "}
                  {group.currency}
                </BidiText>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
