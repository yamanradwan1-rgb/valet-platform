"use client";

import { Car, ChevronRight, Clock } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { DashboardSessionState, SessionOverviewEntry } from "@valet/contracts";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readSessions, readStateCounts } from "../operations-api";
import { operationsCopy } from "../operations-copy";
import { sessionStateLabel, sessionTone } from "../operations-labels";
import {
  CursorControls, DetailAction, Fact, FactList, OperationsDrawer, OperationsPage,
  ReadState, StatusBadge, styles,
} from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

const visibleStates: readonly DashboardSessionState[] = [
  "AWAITING_PARKING", "CHECKING_IN", "PARKING", "PARKED",
  "REQUESTED", "RETRIEVING", "READY", "HANDOFF_PENDING",
];

export function LiveOperationsPage() {
  const { scopeKey } = useOperationsContext();
  return <LiveOperationsContent key={scopeKey} />;
}

function LiveOperationsContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const [selected, setSelected] = useState<SessionOverviewEntry | null>(null);
  const [tab, setTab] = useState<DashboardSessionState | "ALL">("ALL");
  const locationId = scope.locationId ?? "";
  const enabled = exactLocation && (scope.authority === "COMPANY_ADMIN" || scope.authority === "LOCATION_MANAGER");
  const loadSessions = useCallback((signal: AbortSignal) =>
    readSessions(dashboard.api, locationId, page.cursor, signal),
  [dashboard.api, locationId, page.cursor]);
  const loadCounts = useCallback((signal: AbortSignal) =>
    readStateCounts(dashboard.api, locationId, signal), [dashboard.api, locationId]);
  const sessions = useOperationsRead(`${scopeKey}:live:sessions:${page.cursor ?? "first"}`, loadSessions, enabled);
  const counts = useOperationsRead(`${scopeKey}:live:counts`, loadCounts, enabled);
  const count = (state: DashboardSessionState) =>
    counts.data?.counts.find((item) => item.state === state)?.count ?? 0;
  const active = counts.data?.counts.reduce(
    (sum, item) => sum + (item.state === "COMPLETED" ? 0 : item.count), 0,
  ) ?? 0;
  const filtered = useMemo(
    () => sessions.data?.items.filter((item) => tab === "ALL" || item.state === tab) ?? [],
    [sessions.data?.items, tab],
  );

  if (!enabled) {
    return <OperationsPage subtitle={t.liveSubtitle} title={t.liveTitle}><div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div></OperationsPage>;
  }
  return (
    <OperationsPage subtitle={t.liveSubtitle} title={t.liveTitle}>
      <div className={styles.metricGrid}>
        <Metric icon={<Car size={24} />} iconClass={styles.metricNavy} label={t.activeSessions} value={active} />
        <Metric icon={<Clock size={24} />} iconClass={styles.metricAmber} label={t.retrievalRequested} value={count("REQUESTED")} />
        <Metric icon={<ChevronRight size={25} />} iconClass={styles.metricOrange} label={t.inTransit} value={count("PARKING") + count("RETRIEVING")} />
        <Metric icon={<span>!</span>} iconClass={styles.metricRed} label={t.handoffPending} value={count("HANDOFF_PENDING")} />
      </div>
      <div className={styles.tabs} aria-label={t.state} role="tablist">
        <button aria-selected={tab === "ALL"} className={`${styles.tab} ${tab === "ALL" ? styles.tabActive : ""}`} onClick={() => setTab("ALL")} role="tab" type="button">{t.all} ({active})</button>
        {visibleStates.map((state) => (
          <button aria-selected={tab === state} className={`${styles.tab} ${tab === state ? styles.tabActive : ""}`} key={state} onClick={() => setTab(state)} role="tab" type="button">
            {sessionStateLabel(state)} ({count(state)})
          </button>
        ))}
      </div>
      <div className={styles.loadedPageNote}>{t.currentPageOnly}</div>
      <ReadState empty={sessions.data?.items.length === 0} error={sessions.error} loading={sessions.loading} onRetry={sessions.refresh}>
        <div className={styles.card}><div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{t.vehicle}</th><th>{t.session}</th><th>{t.assignee}</th><th>{t.state}</th><th>{t.updated}</th><th className={styles.actionHeader}>{t.action}</th></tr></thead>
          <tbody>{filtered.map((item) => (
            <tr className={styles.row} key={item.sessionId}>
              <td><VehicleIdentity item={item} /></td>
              <td><bdi dir="ltr">{item.sessionId}</bdi></td>
              <td>{item.currentAssigneeMembershipId ? <bdi dir="ltr">{item.currentAssigneeMembershipId}</bdi> : t.unassigned}</td>
              <td><StatusBadge tone={sessionTone(item.state)}>{sessionStateLabel(item.state)}</StatusBadge></td>
              <td><bdi dir="ltr">{item.updatedAt}</bdi></td>
              <td className={styles.actionCell}><DetailAction label={t.details} onClick={() => setSelected(item)} /></td>
            </tr>
          ))}</tbody>
        </table></div>
        <CursorControls canNext={Boolean(sessions.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => page.next(sessions.data?.nextCursor ?? null)} onPrevious={page.previous} />
        </div>
      </ReadState>
      {selected ? <SessionDrawer item={selected} onClose={() => setSelected(null)} /> : null}
    </OperationsPage>
  );
}

function Metric(props: { readonly icon: React.ReactNode; readonly iconClass: string | undefined; readonly label: string; readonly value: number }) {
  return <div className={`${styles.card} ${styles.metric}`}><div className={`${styles.metricIcon} ${props.iconClass ?? ""}`}>{props.icon}</div><div><div className={styles.metricValue}>{props.value}</div><div className={styles.metricLabel}>{props.label}</div></div></div>;
}

function VehicleIdentity({ item }: { readonly item: SessionOverviewEntry }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const label = item.vehicle.plateNumberNormalized ?? item.vehicle.temporaryDescriptor ?? t.plateUnavailable;
  return <div><div className={styles.primaryText}><bdi dir="ltr">{label}</bdi></div><div className={styles.muted}><bdi dir="ltr">{item.vehicle.vehicleId}</bdi></div></div>;
}

function SessionDrawer({ item, onClose }: { readonly item: SessionOverviewEntry; readonly onClose: () => void }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return <OperationsDrawer label={t.details} onClose={onClose} subtitle={<bdi dir="ltr">{item.sessionId}</bdi>}><FactList>
    <Fact label={t.vehicle} value={<bdi dir="ltr">{item.vehicle.plateNumberNormalized ?? item.vehicle.temporaryDescriptor ?? item.vehicle.vehicleId}</bdi>} />
    <Fact label={t.state} value={<StatusBadge tone={sessionTone(item.state)}>{sessionStateLabel(item.state)}</StatusBadge>} />
    <Fact label={t.assignee} value={item.currentAssigneeMembershipId ? <bdi dir="ltr">{item.currentAssigneeMembershipId}</bdi> : t.unassigned} />
    <Fact label={t.keySlotId} value={item.keySlotId ? <bdi dir="ltr">{item.keySlotId}</bdi> : "—"} />
    <Fact label={t.parkingSpotId} value={item.parkingSpotId ? <bdi dir="ltr">{item.parkingSpotId}</bdi> : "—"} />
    <Fact label={t.updated} value={<bdi dir="ltr">{item.updatedAt}</bdi>} />
  </FactList></OperationsDrawer>;
}
