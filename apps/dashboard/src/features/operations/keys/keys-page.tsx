"use client";

import { useCallback, useState } from "react";
import type { KeySlotOverviewEntry } from "@valet/contracts";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readKeys } from "../operations-api";
import { operationsCopy } from "../operations-copy";
import {
  DetailAction, Fact, FactList, OperationsDrawer, OperationsPage, ReferenceCursorControls,
  ReadState, StatusBadge, styles,
} from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

export function KeysPage() {
  const { scopeKey } = useOperationsContext();
  return <KeysContent key={scopeKey} />;
}

function KeysContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const [selected, setSelected] = useState<KeySlotOverviewEntry | null>(null);
  const locationId = scope.locationId ?? "";
  const enabled = exactLocation && (scope.authority === "COMPANY_ADMIN" || scope.authority === "LOCATION_MANAGER");
  const load = useCallback((signal: AbortSignal) =>
    readKeys(dashboard.api, locationId, page.cursor, signal),
  [dashboard.api, locationId, page.cursor]);
  const read = useOperationsRead(`${scopeKey}:keys:${page.cursor ?? "first"}`, load, enabled);
  if (!enabled) return <OperationsPage subtitle={t.keysSubtitle} title={t.keysTitle}><div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div></OperationsPage>;
  return (
    <OperationsPage subtitle={t.keysSubtitle} title={t.keysTitle}>
      <div className={styles.referenceFilterBetween}>
        <div className={styles.filterGroup}>
          <span className={styles.filterPlaceholder}>{t.exactLocationLabel}</span>
          <span className={styles.filterPlaceholder}>ACTIVE / INACTIVE</span>
        </div>
      </div>
      <ReadState empty={read.data?.items.length === 0} error={read.error} loading={read.loading} onRetry={read.refresh}>
        <div className={styles.card}><div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{t.keySlot}</th><th>{t.slotId}</th><th>{t.slotState}</th><th>{t.holdingSession}</th><th className={styles.actionHeader}>{t.action}</th></tr></thead>
          <tbody>{read.data?.items.map((item) => (
            <tr className={styles.row} key={item.keySlotId}>
              <td className={styles.primaryText}><bdi dir="ltr">{item.code}</bdi></td>
              <td><bdi dir="ltr">{item.keySlotId}</bdi></td>
              <td><StatusBadge tone={item.slotStatus === "ACTIVE" ? "good" : "neutral"}>{item.slotStatus}</StatusBadge></td>
              <td>{item.holdingSessionId ? <bdi dir="ltr">{item.holdingSessionId}</bdi> : t.emptySlot}</td>
              <td className={styles.actionCell}><DetailAction label={t.details} onClick={() => setSelected(item)} /></td>
            </tr>
          ))}</tbody>
        </table></div><ReferenceCursorControls canNext={Boolean(read.data?.nextCursor)} canPrevious={page.canPrevious} label={`${t.currentPageOnly}: ${read.data?.items.length ?? 0}`} onNext={() => page.next(read.data?.nextCursor ?? null)} onPrevious={page.previous} size="keys" /></div>
      </ReadState>
      {selected ? <KeyDrawer item={selected} onClose={() => setSelected(null)} /> : null}
    </OperationsPage>
  );
}

function KeyDrawer({ item, onClose }: { readonly item: KeySlotOverviewEntry; readonly onClose: () => void }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return <OperationsDrawer label={`${t.keySlot} ${item.code}`} onClose={onClose}><FactList>
    <Fact label={t.slotId} value={<bdi dir="ltr">{item.keySlotId}</bdi>} />
    <Fact label={t.slotState} value={<StatusBadge tone={item.slotStatus === "ACTIVE" ? "good" : "neutral"}>{item.slotStatus}</StatusBadge>} />
    <Fact label={t.holdingSession} value={item.holdingSessionId ? <bdi dir="ltr">{item.holdingSessionId}</bdi> : t.emptySlot} />
  </FactList></OperationsDrawer>;
}
