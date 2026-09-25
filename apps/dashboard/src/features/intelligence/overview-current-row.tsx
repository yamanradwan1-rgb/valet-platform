import type { ReactNode } from "react";

import styles from "./overview-current.module.css";

export function OverviewCurrentRow(props: {
  readonly detail?: ReactNode;
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly tone?: "positive" | "danger";
  readonly value: ReactNode;
}) {
  return (
    <div className={styles.currentRow}>
      <span aria-hidden="true" className={`${styles.currentIcon} ${
        props.tone === "positive" ? styles.currentIconPositive :
        props.tone === "danger" ? styles.currentIconDanger : ""
      }`}>
        {props.icon}
      </span>
      <span className={styles.currentText}>
        <span>{props.label}</span>
        {props.detail ? <small>{props.detail}</small> : null}
      </span>
      <strong>{props.value}</strong>
    </div>
  );
}
