"use client";

import { Search } from "lucide-react";
import { useCallback, useState } from "react";
import type { SessionOverviewEntry } from "@valet/contracts";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readSessions } from "../operations-api";
import { operationsCopy } from "../operations-copy";
import { sessionStateLabel, sessionTone } from "../operations-labels";
import {
  CursorControls, DetailAction, Fact, FactList, OperationsDrawer, OperationsPage,
  ReadState, StatusBadge, styles,
} from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

export function VehiclesPage() {
  const { scopeKey } = useOperationsContext();
  return <VehiclesContent key={scopeKey} />;
}

function VehiclesContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const [selected, setSelected] = useState<SessionOverviewEntry | null>(null);
  const locationId = scope.locationId ?? "";
  const enabled = exactLocation && (scope.authority === "COMPANY_ADMIN" || scope.authority === "LOCATION_MANAGER");
  const load = useCallback((signal: AbortSignal) =>
    readSessions(dashboard.api, locationId, page.cursor, signal),
  [dashboard.api, locationId, page.cursor]);
  const read = useOperationsRead(`${scopeKey}:vehicles:${page.cursor ?? "first"}`, load, enabled);
  if (!enabled) return <OperationsPage subtitle={t.vehiclesSubtitle} title={t.vehiclesTitle}><div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div></OperationsPage>;
  return (
    <OperationsPage subtitle={t.vehiclesSubtitle} title={t.vehiclesTitle}>
      <div className={styles.searchPlaceholder}><Search aria-hidden="true" /><span>{t.serverCohort}: {t.currentSessions}</span></div>
      <div className={styles.referenceFilterRow} aria-label={t.currentSessions}>
        <span className={styles.filterPlaceholder}>{t.exactLocationLabel}</span>
        <span className={styles.filterPlaceholder}>{t.canonicalStatuses}</span>
        <span className={styles.filterPlaceholder}>{t.currentSessions}</span>
      </div>
      <ReadState empty={read.data?.items.length === 0} error={read.error} loading={read.loading} onRetry={read.refresh}>
        <div className={styles.card}><div className={styles.tableWrap}><table className={`${styles.table} ${styles.vehicleTable}`}>
          <thead><tr><th>{t.plateDescriptor}</th><th>{t.session}</th><th>{t.state}</th><th>{t.keySlotId}</th><th>{t.updated}</th><th className={styles.actionHeader}>{t.action}</th></tr></thead>
          <tbody>{read.data?.items.map((item) => (
            <tr className={styles.row} key={item.sessionId}>
              <td><VehicleCell item={item} /></td>
              <td><bdi dir="ltr">{item.sessionId}</bdi></td>
              <td><StatusBadge tone={sessionTone(item.state)}>{sessionStateLabel(item.state)}</StatusBadge></td>
              <td>{item.keySlotId ? <bdi dir="ltr">{item.keySlotId}</bdi> : "—"}</td>
              <td><bdi dir="ltr">{item.updatedAt}</bdi></td>
              <td className={styles.actionCell}><DetailAction label={t.details} onClick={() => setSelected(item)} /></td>
            </tr>
          ))}</tbody>
        </table></div>
        <CursorControls canNext={Boolean(read.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => page.next(read.data?.nextCursor ?? null)} onPrevious={page.previous} /></div>
      </ReadState>
      {selected ? <VehicleDrawer item={selected} onClose={() => setSelected(null)} /> : null}
    </OperationsPage>
  );
}

function VehicleCell({ item }: { readonly item: SessionOverviewEntry }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const plate = item.vehicle.plateNumberNormalized;
  return <div><div className={styles.primaryText}><bdi dir="ltr">{plate ?? item.vehicle.temporaryDescriptor ?? t.plateUnavailable}</bdi></div><div className={styles.muted}><bdi dir="ltr">{item.vehicle.plateCountry ?? item.vehicle.vehicleId}</bdi></div></div>;
}

function VehicleDrawer({ item, onClose }: { readonly item: SessionOverviewEntry; readonly onClose: () => void }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return <OperationsDrawer label={t.vehiclesTitle} onClose={onClose} subtitle={<bdi dir="ltr">{item.vehicle.vehicleId}</bdi>}><FactList>
    <Fact label={t.plate} value={<bdi dir="ltr">{item.vehicle.plateNumberNormalized ?? item.vehicle.temporaryDescriptor ?? t.plateUnavailable}</bdi>} />
    <Fact label={t.plateCountry} value={<bdi dir="ltr">{item.vehicle.plateCountry ?? "—"}</bdi>} />
    <Fact label={t.session} value={<bdi dir="ltr">{item.sessionId}</bdi>} />
    <Fact label={t.state} value={<StatusBadge tone={sessionTone(item.state)}>{sessionStateLabel(item.state)}</StatusBadge>} />
    <Fact label={t.assignee} value={item.currentAssigneeMembershipId ? <bdi dir="ltr">{item.currentAssigneeMembershipId}</bdi> : t.unassigned} />
    <Fact label={t.updated} value={<bdi dir="ltr">{item.updatedAt}</bdi>} />
  </FactList></OperationsDrawer>;
}
