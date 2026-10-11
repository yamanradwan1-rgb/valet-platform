import type { ReactNode } from "react";
import { operationsCopy } from "../operations-copy";
import { styles } from "../operations-ui";
import {
  liveFilterLabel,
  liveOperationsFilters,
  type LiveOperationsFilter,
} from "./live-operations-presentation";
type LiveOperationsView = "SESSIONS" | "RETRIEVAL_QUEUE";

export function LiveFilters({
  countsError,
  filter,
  help,
  locale,
  onChange,
  onRetrieval,
  onRetryCounts,
  view,
}: {
  readonly countsError: Error | null;
  readonly filter: LiveOperationsFilter;
  readonly help?: ReactNode;
  readonly locale: "en" | "ar";
  readonly onChange: (filter: LiveOperationsFilter) => void;
  readonly onRetrieval: () => void;
  readonly onRetryCounts: () => void;
  readonly view: LiveOperationsView;
}) {
  const t = operationsCopy(locale);
  return (
    <div className={styles.liveFilterRow}>
      <div aria-label={t.state} className={styles.liveFilterTabs} role="group">
        {liveOperationsFilters.map((item) => (
          <button
            aria-pressed={view === "SESSIONS" && filter === item}
            className={`${styles.tab} ${view === "SESSIONS" && filter === item ? styles.tabActive : ""}`}
            key={item}
            onClick={() => onChange(item)}
            type="button"
          >
            {liveFilterLabel(item, locale)}
          </button>
        ))}
        <button
          aria-pressed={view === "RETRIEVAL_QUEUE"}
          className={`${styles.tab} ${styles.liveSecondaryTab} ${view === "RETRIEVAL_QUEUE" ? styles.tabActive : ""}`}
          onClick={onRetrieval}
          type="button"
        >
          {t.retrievalQueue}
        </button>
        {countsError ? (
          <button
            className={styles.liveFilterRetry}
            onClick={onRetryCounts}
            type="button"
          >
            {t.metricsUnavailable}
          </button>
        ) : (
          <span className={styles.liveFilterScope}>
            {view === "RETRIEVAL_QUEUE"
              ? t.retrievalPageOnly
              : locale === "ar"
                ? "التصفية على جميع جلسات الموقع"
                : "Filters apply across this Location"}
          </span>
        )}
      </div>
      {help ? <span className={styles.liveFilterHelpSlot}>{help}</span> : null}
    </div>
  );
}

export function Metric({
  icon,
  iconClass,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly iconClass: string | undefined;
  readonly label: string;
  readonly value: number | null;
}) {
  return (
    <div className={`${styles.card} ${styles.metric}`}>
      <div className={`${styles.metricIcon} ${iconClass ?? ""}`}>{icon}</div>
      <div>
        <div className={styles.metricValue}>{value ?? "—"}</div>
        <div className={styles.metricLabel}>{label}</div>
      </div>
    </div>
  );
}
