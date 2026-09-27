import type { ReactNode } from "react";
import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { formatExactCurrency } from "./intelligence-format";
import styles from "./payments-breakdown.module.css";

export function FinancialTable(props: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label={props.label}
      tabIndex={0}
    >
      {props.children}
    </div>
  );
}

export function RateEvidence(props: {
  readonly unavailable: string;
  readonly rate: {
    readonly numerator: number;
    readonly denominator: number;
    readonly percentage: string | null;
  };
}) {
  return (
    <>
      {props.rate.percentage === null ? (
        <span>{props.unavailable}</span>
      ) : (
        <BidiText kind="number">{props.rate.percentage}%</BidiText>
      )}{" "}
      <BidiText kind="number">
        ({props.rate.numerator}/{props.rate.denominator})
      </BidiText>
    </>
  );
}

export function Money(props: {
  readonly currency: string;
  readonly locale: DashboardLocale;
  readonly value: string;
}) {
  return (
    <td className={styles.money}>
      <BidiText kind="number">
        {formatExactCurrency(props.value, props.currency, props.locale)}
      </BidiText>
    </td>
  );
}

export function State(props: {
  readonly compact?: boolean;
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retry?: string;
}) {
  return (
    <div
      className={props.compact ? styles.compactState : styles.panelState}
      role={props.onRetry ? "alert" : "status"}
    >
      <span>{props.message}</span>
      {props.onRetry && props.retry ? (
        <button
          className={styles.retryButton}
          onClick={props.onRetry}
          type="button"
        >
          {props.retry}
        </button>
      ) : null}
    </div>
  );
}
