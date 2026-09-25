"use client";

import type { ManagementLocation } from "@valet/contracts";
import { Car, ChevronRight, Clock } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";

import type { SelectedDashboardScope } from "../../../components/scope";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readSessions, readStateCounts } from "../operations-api";
import { operationsCopy } from "../operations-copy";
import { OperationsPage, styles } from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";
import {
  liveFilterLabel,
  liveOperationsFilters,
  liveOperationsKpis,
  type LiveOperationsFilter,
} from "./live-operations-presentation";
import { LiveOperationsTable } from "./live-operations-table";

export function LiveOperationsPage() {
  const { scopeKey } = useOperationsContext();
  return <LiveOperationsContent key={scopeKey} />;
}

function LiveOperationsContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const [filter, setFilter] = useState<LiveOperationsFilter>("ALL");
  const location = selectedLocation(dashboard.selectedScope);
  const locationId = location?.locationId ?? "";
  const enabled =
    exactLocation &&
    location !== null &&
    (scope.authority === "COMPANY_ADMIN" ||
      scope.authority === "LOCATION_MANAGER");
  const loadSessions = useCallback(
    (signal: AbortSignal) =>
      readSessions(dashboard.api, locationId, page.cursor, signal),
    [dashboard.api, locationId, page.cursor],
  );
  const loadCounts = useCallback(
    (signal: AbortSignal) =>
      readStateCounts(dashboard.api, locationId, signal),
    [dashboard.api, locationId],
  );
  const sessions = useOperationsRead(
    `${scopeKey}:live:sessions:${page.cursor ?? "first"}`,
    loadSessions,
    enabled,
  );
  const counts = useOperationsRead(
    `${scopeKey}:live:counts`,
    loadCounts,
    enabled,
  );
  const kpis = counts.data === null ? null : liveOperationsKpis(counts.data);

  if (!enabled || location === null) {
    return (
      <div className={styles.liveOperations}>
        <OperationsPage subtitle={t.liveSubtitle} title={t.liveTitle}>
          <div className={`${styles.card} ${styles.state}`}>
            {t.exactLocation}
          </div>
        </OperationsPage>
      </div>
    );
  }
  return (
    <div className={styles.liveOperations}>
      <OperationsPage
        action={<span aria-hidden="true" className={styles.liveHeaderActionSpace} />}
        subtitle={t.liveSubtitle}
        title={t.liveTitle}
      >
        <div className={styles.metricGrid}>
          <Metric icon={<Car size={24} />} iconClass={styles.metricNavy} label={t.activeSessions} value={kpis?.active ?? null} />
          <Metric icon={<Clock size={24} />} iconClass={styles.metricAmber} label={t.requestedSessions} value={kpis?.requested ?? null} />
          <Metric icon={<ChevronRight size={25} />} iconClass={styles.metricOrange} label={t.inTransit} value={kpis?.inTransit ?? null} />
          <Metric icon={<span>!</span>} iconClass={styles.metricRed} label={t.handoffPending} value={kpis?.handoffPending ?? null} />
        </div>
        <LiveFilters
          countsError={counts.error}
          filter={filter}
          locale={locale}
          onChange={setFilter}
          onRetryCounts={counts.refresh}
        />
        <LiveOperationsTable
          canNext={Boolean(sessions.data?.nextCursor)}
          canPrevious={page.canPrevious}
          error={sessions.error}
          filter={filter}
          items={sessions.data?.items ?? []}
          loading={sessions.loading}
          locale={locale}
          location={location}
          onNext={() => {
            setFilter("ALL");
            page.next(sessions.data?.nextCursor ?? null);
          }}
          onPrevious={() => {
            setFilter("ALL");
            page.previous();
          }}
          onRetry={sessions.refresh}
        />
      </OperationsPage>
    </div>
  );
}

function selectedLocation(
  selected: SelectedDashboardScope | null,
): ManagementLocation | null {
  if (selected?.authority === "COMPANY_ADMIN") {
    return selected.context.selectedLocation;
  }
  if (selected?.authority === "LOCATION_MANAGER") return selected.location;
  return null;
}

function LiveFilters({
  countsError,
  filter,
  locale,
  onChange,
  onRetryCounts,
}: {
  readonly countsError: Error | null;
  readonly filter: LiveOperationsFilter;
  readonly locale: "en" | "ar";
  readonly onChange: (filter: LiveOperationsFilter) => void;
  readonly onRetryCounts: () => void;
}) {
  const t = operationsCopy(locale);
  return (
    <div className={styles.liveFilterRow}>
      <div aria-label={t.state} className={styles.liveFilterTabs} role="group">
        {liveOperationsFilters.map((item) => (
          <button
            aria-pressed={filter === item}
            className={`${styles.tab} ${filter === item ? styles.tabActive : ""}`}
            key={item}
            onClick={() => onChange(item)}
            type="button"
          >
            {liveFilterLabel(item, locale)}
          </button>
        ))}
      </div>
      {countsError ? (
        <button
          className={styles.liveFilterRetry}
          onClick={onRetryCounts}
          type="button"
        >
          {t.metricsUnavailable}
        </button>
      ) : (
        <span className={styles.liveFilterScope}>{t.liveFilterScope}</span>
      )}
    </div>
  );
}

function Metric({
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
