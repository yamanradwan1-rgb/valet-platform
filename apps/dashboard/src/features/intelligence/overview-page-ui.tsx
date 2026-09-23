import type { ReactNode } from "react";

import { BidiText } from "../../components/presentation/panel";
import styles from "./overview.module.css";

export function OverviewMetricCard(props: {
  readonly available: boolean;
  readonly context: string;
  readonly danger?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <section className={styles.metricCard}>
      <div className={styles.metricTop}>
        <div>
          <div className={styles.metricValue}>
            {props.available ? (
              <BidiText kind="number">{props.value}</BidiText>
            ) : props.value}
          </div>
          <div className={styles.metricLabel}>{props.label}</div>
        </div>
        <div
          className={`${styles.metricIcon} ${props.danger ? styles.metricIconDanger : ""}`}
        >
          {props.icon}
        </div>
      </div>
      <div className={styles.metricContext}>
        <span className={styles.metricPill}>{props.context}</span>
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
