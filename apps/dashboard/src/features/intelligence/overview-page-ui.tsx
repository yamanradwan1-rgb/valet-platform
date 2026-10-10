import type { ReactNode } from "react";

import { BidiText } from "../../components/presentation/panel";
import { ScopedContextHelp } from "../help/scoped-context-help";
import styles from "./overview.module.css";

export function OverviewMetricCard(props: {
  readonly available: boolean;
  readonly context: string;
  readonly danger?: boolean;
  readonly helpKey?: "overview.metrics";
  readonly icon: ReactNode;
  readonly label: string;
  readonly tone?: "positive" | "info" | "danger";
  readonly value: string;
  readonly valueDirection?: "ltr" | "rtl";
}) {
  return (
    <section className={styles.metricCard}>
      <div className={styles.metricTop}>
        <div>
          <div className={styles.metricValue}>
            {props.available ? (
              props.valueDirection === "rtl"
                ? <bdi className="bidi-number" dir="rtl">{props.value}</bdi>
                : <BidiText kind="number">{props.value}</BidiText>
            ) : props.value}
          </div>
          <div className={styles.metricLabel}>{props.label}</div>
        </div>
        {props.helpKey ? <ScopedContextHelp helpKey={props.helpKey} /> : null}
        <div
          className={`${styles.metricIcon} ${props.danger ? styles.metricIconDanger : ""}`}
        >
          {props.icon}
        </div>
      </div>
      <div className={styles.metricContext}>
        <span className={`${styles.metricPill} ${
          props.tone === "positive" ? styles.metricPillPositive :
          props.tone === "danger" ? styles.metricPillDanger : ""
        }`}>{props.context}</span>
      </div>
    </section>
  );
}

export function OverviewPanelState(props: {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retry?: string;
}) {
  return (
    <div
      className={styles.panelState}
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
