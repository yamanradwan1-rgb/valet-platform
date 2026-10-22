import type { CustomerFeedbackAnalyticsResponse } from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { customerFeedbackCopy } from "./customer-feedback-copy";
import { CustomerFeedbackInsights } from "./customer-feedback-insights";
import { CustomerFeedbackSummary } from "./customer-feedback-summary";
import styles from "./customer-feedback.module.css";

export interface CustomerFeedbackSectionProps {
  readonly locale: DashboardLocale;
  readonly scopeLabel: string;
  readonly period: { readonly from: string; readonly to: string } | null;
  readonly periodMessage: string | null;
  readonly data: CustomerFeedbackAnalyticsResponse | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}

function isDenied(error: unknown): boolean {
  return error instanceof DashboardApiError &&
    (error.kind === "authorization" || error.kind === "entitlement" || error.kind === "mfa");
}

export function CustomerFeedbackSection(props: CustomerFeedbackSectionProps) {
  const t = customerFeedbackCopy(props.locale);
  const denied = isDenied(props.error);
  const state = props.period === null ? "period" : props.loading ? "loading"
    : denied ? "denied" : props.error ? "error" : props.data ? "ready" : "loading";
  const message = state === "period" ? props.periodMessage ?? t.periodRequired
    : state === "loading" ? t.loading
    : state === "denied" ? props.periodMessage ?? t.denied
    : state === "error" ? props.periodMessage ?? t.error : null;

  return (
    <section
      aria-labelledby="feedback-heading"
      className={styles.section}
      data-testid="customer-feedback-section"
    >
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="feedback-heading">{t.heading}</h2>
          <p>
            {props.scopeLabel}
            {props.period ? <> · <bdi dir="ltr">{props.period.from} – {props.period.to}</bdi></> : null}
          </p>
        </div>
      </div>
      <div aria-busy={state === "loading"}>
        {state === "ready" && props.data ? (
          <>
            <CustomerFeedbackSummary data={props.data} locale={props.locale} />
            <CustomerFeedbackInsights data={props.data} locale={props.locale} />
            <p className={styles.note}>{t.cohort}</p>
          </>
        ) : (
          <div className={`${styles.surface} ${styles.status}`} data-state={state} data-testid="feedback-state">
            <p>{message}</p>
            {state === "error" ? (
              <button className={styles.retry} onClick={props.onRetry} type="button">{t.retry}</button>
            ) : null}
          </div>
        )}
      </div>
      <span aria-atomic="true" className={styles.visuallyHidden} role="status">
        {state === "ready" ? t.loaded : message}
      </span>
    </section>
  );
}
