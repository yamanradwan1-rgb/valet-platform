"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { administrationCopy } from "./administration-copy";
import styles from "./administration.module.css";

export function AdministrationPage(props: {
  readonly children: ReactNode;
  readonly icon?: LucideIcon;
  readonly subtitle: string;
  readonly title: string;
  readonly action?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div className={styles.page} data-testid="md02-page">
      <div className={styles.header}>
        <div>
          <div className={styles.heading}>
            {Icon ? <Icon className={styles.headingIcon} aria-hidden="true" /> : null}
            <h1 className={styles.title}>{props.title}</h1>
          </div>
          <p className={styles.subtitle}>{props.subtitle}</p>
        </div>
        {props.action}
      </div>
      {props.children}
    </div>
  );
}

export function ReadState(props: {
  readonly loading: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly children: ReactNode;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  if (props.loading) return <div className={`${styles.card} ${styles.empty}`}>{t.loading}</div>;
  if (props.error) {
    return (
      <div className={styles.error} role="alert">
        <div>{props.error.message}</div>
        <button className={styles.secondary} onClick={props.onRetry} type="button">{t.retry}</button>
      </div>
    );
  }
  return <>{props.children}</>;
}

export function StatusBadge({ good, children }: { readonly good?: boolean; readonly children: ReactNode }) {
  return <span className={`${styles.badge} ${good === true ? styles.badgeGood : good === false ? styles.badgeBad : ""}`}>{children}</span>;
}

export { styles };
