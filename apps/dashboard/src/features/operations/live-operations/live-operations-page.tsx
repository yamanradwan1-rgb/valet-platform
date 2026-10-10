"use client";

import { Car, ChevronRight, Clock } from "lucide-react";
import { useCallback, useState } from "react";

import { selectedOperationsLocation } from "../operations-location";
import { LiveFilters, Metric } from "./live-operations-controls";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import {
  readRetrievalQueue,
  readLiveSessions,
  readStateCounts,
} from "../operations-api";
import { operationsCopy } from "../operations-copy";
import { OperationsPage, styles } from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useAuthoritativeRead } from "../../administration/use-authoritative-read";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import {
  liveOperationsKpis,
  type LiveOperationsFilter,
} from "./live-operations-presentation";
import { LiveOperationsTable } from "./live-operations-table";
import { RetrievalQueueTable } from "./retrieval-queue-table";

type LiveOperationsView = "SESSIONS" | "RETRIEVAL_QUEUE";

export function LiveOperationsPage() {
  const { scopeKey } = useOperationsContext();
  return <LiveOperationsContent key={scopeKey} />;
}

function LiveOperationsContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const retrievalPage = useCursorPage();
  const [filter, setFilter] = useState<LiveOperationsFilter>("ALL");
  const [listRevision, setListRevision] = useState(0);
  const [view, setView] = useState<LiveOperationsView>("SESSIONS");
  const location = selectedOperationsLocation(dashboard.selectedScope);
  const locationId = location?.locationId ?? "";
  const enabled =
    exactLocation &&
    location !== null &&
    (scope.authority === "COMPANY_ADMIN" ||
      scope.authority === "LOCATION_MANAGER");
  const loadSessions = useCallback(
    (signal: AbortSignal) =>
      readLiveSessions(dashboard.api, locationId, page.cursor, signal, filter),
    [dashboard.api, locationId, page.cursor, filter],
  );
  const loadCounts = useCallback(
    (signal: AbortSignal) => readStateCounts(dashboard.api, locationId, signal),
    [dashboard.api, locationId],
  );
  const loadRetrieval = useCallback(
    (signal: AbortSignal) =>
      readRetrievalQueue(
        dashboard.api,
        locationId,
        retrievalPage.cursor,
        signal,
      ),
    [dashboard.api, locationId, retrievalPage.cursor],
  );
  const sessions = useAuthoritativeRead(
    `${scopeKey}:live:sessions:${filter}:${listRevision}:${page.cursor ?? "first"}`,
    loadSessions,
    enabled && view === "SESSIONS",
  );
  const counts = useAuthoritativeRead(
    `${scopeKey}:live:counts`,
    loadCounts,
    enabled,
  );
  const retrieval = useAuthoritativeRead(
    `${scopeKey}:live:retrieval:${listRevision}:${retrievalPage.cursor ?? "first"}`,
    loadRetrieval,
    enabled && view === "RETRIEVAL_QUEUE",
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
        action={
          <span className={styles.liveHeaderActionSpace}>
            <ScopedContextHelp helpKey="live.kpis" />
          </span>
        }
        help={<ScopedContextHelp helpKey="live.page" />}
        subtitle={t.liveSubtitle}
        title={t.liveTitle}
      >
        <div className={styles.metricGrid}>
          <Metric
            icon={<Car size={24} />}
            iconClass={styles.metricNavy}
            label={t.activeSessions}
            value={kpis?.active ?? null}
          />
          <Metric
            icon={<Clock size={24} />}
            iconClass={styles.metricAmber}
            label={t.requestedSessions}
            value={kpis?.requested ?? null}
          />
          <Metric
            icon={<ChevronRight size={25} />}
            iconClass={styles.metricOrange}
            label={t.inTransit}
            value={kpis?.inTransit ?? null}
          />
          <Metric
            icon={<span>!</span>}
            iconClass={styles.metricRed}
            label={t.handoffPending}
            value={kpis?.handoffPending ?? null}
          />
        </div>
        <LiveFilters
          help={<ScopedContextHelp helpKey={view === "RETRIEVAL_QUEUE" ? "live.retrieval" : "live.sessions"} />}
          countsError={counts.error}
          filter={filter}
          locale={locale}
          onChange={(next) => {
            setView("SESSIONS");
            setFilter(next);
            page.reset();
            setListRevision((value) => value + 1);
          }}
          onRetrieval={() => {
            setView("RETRIEVAL_QUEUE");
            page.reset();
            retrievalPage.reset();
            setListRevision((value) => value + 1);
          }}
          onRetryCounts={counts.refresh}
          view={view}
        />
        {view === "RETRIEVAL_QUEUE" ? (
          <RetrievalQueueTable
            key={`queue:${listRevision}:${retrievalPage.cursor}`}
            canNext={Boolean(retrieval.data?.nextCursor)}
            canPrevious={retrievalPage.canPrevious}
            error={retrieval.error}
            items={retrieval.data?.items ?? []}
            loading={retrieval.loading}
            locale={locale}
            location={location}
            onNext={() => {
              retrievalPage.next(retrieval.data?.nextCursor ?? null);
              setListRevision((value) => value + 1);
            }}
            onPrevious={() => {
              retrievalPage.previous();
              setListRevision((value) => value + 1);
            }}
            onRetry={retrieval.refresh}
          />
        ) : (
          <LiveOperationsTable
            help={<ScopedContextHelp helpKey="live.sessionDetail" />}
            key={`sessions:${listRevision}:${filter}:${page.cursor}`}
            canNext={Boolean(sessions.data?.nextCursor)}
            canPrevious={page.canPrevious}
            error={sessions.error}
            items={sessions.data?.items ?? []}
            loading={sessions.loading}
            locale={locale}
            location={location}
            onNext={() => {
              setListRevision((value) => value + 1);
              page.next(sessions.data?.nextCursor ?? null);
            }}
            onPrevious={() => {
              setListRevision((value) => value + 1);
              page.previous();
            }}
            onRetry={sessions.refresh}
          />
        )}
      </OperationsPage>
    </div>
  );
}
