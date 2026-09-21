"use client";

import { useCallback, useState } from "react";
import type { IncidentOverviewEntry } from "@valet/contracts";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readIncidents } from "../operations-api";
import { operationsCopy } from "../operations-copy";
import { incidentTone, severityTone } from "../operations-labels";
import {
  DetailAction, Fact, FactList, OperationsDrawer, OperationsPage, ReferenceCursorControls,
  ReadState, StatusBadge, styles,
} from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

export function IncidentsPage() {
  const { scopeKey } = useOperationsContext();
  return <IncidentsContent key={scopeKey} />;
}

function IncidentsContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const [selected, setSelected] = useState<IncidentOverviewEntry | null>(null);
  const locationId = scope.locationId ?? "";
  const enabled = exactLocation && (scope.authority === "COMPANY_ADMIN" || scope.authority === "LOCATION_MANAGER");
  const load = useCallback((signal: AbortSignal) =>
    readIncidents(dashboard.api, locationId, page.cursor, signal),
  [dashboard.api, locationId, page.cursor]);
  const read = useOperationsRead(`${scopeKey}:incidents:${page.cursor ?? "first"}`, load, enabled);
  if (!enabled) return <OperationsPage subtitle={t.incidentsSubtitle} title={t.incidentsTitle}><div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div></OperationsPage>;
  return (
    <OperationsPage subtitle={t.incidentsSubtitle} subtitleMargin="half" title={t.incidentsTitle}>
      <div className={styles.incidentFilterRow}>
        <span className={styles.incidentFilterPlaceholder}>{t.exactLocationLabel}</span>
        <span className={styles.incidentFilterPlaceholder}>OPEN / INVESTIGATING</span>
        <span className={styles.incidentFilterPlaceholder}>{t.allReturnedTypes}</span>
        <span className={styles.incidentFilterPlaceholder}>{t.allSeverities}</span>
        <span className={styles.incidentFilterPlaceholder}>{t.currentCohort}</span>
      </div>
      <ReadState empty={read.data?.items.length === 0} emptyText={t.noOpenIncidents} error={read.error} loading={read.loading} onRetry={read.refresh}>
        <div className={styles.card}><div className={styles.tableWrap}><table className={`${styles.table} ${styles.incidentTable}`}>
          <thead><tr><th>{t.created}</th><th>{t.type}</th><th>{t.session}</th><th>{t.description}</th><th>{t.state}</th><th>{t.severity}</th><th className={styles.actionHeader}>{t.action}</th></tr></thead>
          <tbody>{read.data?.items.map((item) => (
            <tr className={styles.row} key={item.incidentId}>
              <td><bdi dir="ltr">{item.createdAt}</bdi></td>
              <td className={styles.primaryText}>{item.type}</td>
              <td><bdi dir="ltr">{item.valetSessionId}</bdi></td>
              <td>{item.description}</td>
              <td><StatusBadge tone={incidentTone(item.status)}>{item.status}</StatusBadge></td>
              <td><StatusBadge tone={severityTone(item.severity)}>{item.severity}</StatusBadge></td>
              <td className={styles.actionCell}><DetailAction label={t.details} onClick={() => setSelected(item)} /></td>
            </tr>
          ))}</tbody>
        </table></div><ReferenceCursorControls canNext={Boolean(read.data?.nextCursor)} canPrevious={page.canPrevious} label={`${t.currentPageOnly}: ${read.data?.items.length ?? 0}`} onNext={() => page.next(read.data?.nextCursor ?? null)} onPrevious={page.previous} size="incidents" /></div>
      </ReadState>
      {selected ? <IncidentDrawer item={selected} onClose={() => setSelected(null)} /> : null}
    </OperationsPage>
  );
}

function IncidentDrawer({ item, onClose }: { readonly item: IncidentOverviewEntry; readonly onClose: () => void }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return <OperationsDrawer label={t.details} onClose={onClose} subtitle={<bdi dir="ltr">{item.incidentId}</bdi>}><FactList>
    <Fact label={t.type} value={item.type} />
    <Fact label={t.description} value={item.description} />
    <Fact label={t.state} value={<StatusBadge tone={incidentTone(item.status)}>{item.status}</StatusBadge>} />
    <Fact label={t.severity} value={<StatusBadge tone={severityTone(item.severity)}>{item.severity}</StatusBadge>} />
    <Fact label={t.session} value={<bdi dir="ltr">{item.valetSessionId}</bdi>} />
    <Fact label={t.created} value={<bdi dir="ltr">{item.createdAt}</bdi>} />
  </FactList></OperationsDrawer>;
}
