"use client";

import type { KeySlotOverviewEntry } from "@valet/contracts";
import { useCallback, useState } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import localStyles from "../accountability.module.css";
import { readKeys } from "../operations-api";
import { selectedOperationsLocation } from "../operations-location";
import { operationsCopy } from "../operations-copy";
import {
  DetailAction,
  Fact,
  FactList,
  OperationsDrawer,
  ReferenceCursorControls,
  ReadState,
  StatusBadge,
  styles,
} from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";
import { keyCopy, keyStatusLabel, keyUsageLabel } from "./key-presentation";

export function KeysOperationalView() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const copy = keyCopy(locale);
  const location = selectedOperationsLocation(dashboard.selectedScope);
  const page = useCursorPage();
  const [selected, setSelected] = useState<KeySlotOverviewEntry | null>(null);
  const locationId = scope.locationId ?? "";
  const enabled =
    exactLocation &&
    (scope.authority === "COMPANY_ADMIN" ||
      scope.authority === "LOCATION_MANAGER");
  const load = useCallback(
    (signal: AbortSignal) =>
      readKeys(dashboard.api, locationId, page.cursor, signal),
    [dashboard.api, locationId, page.cursor],
  );
  const read = useOperationsRead(
    `${scopeKey}:keys:${page.cursor ?? "first"}`,
    load,
    enabled,
  );

  if (!enabled)
    return (
      <div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div>
    );

  return (
    <>
      <div className={localStyles.keyContext}>
        <span>
          <bdi>{location?.name}</bdi>
        </span>
        <span>{copy.allStatuses}</span>
      </div>
      <ReadState
        empty={read.data?.items.length === 0}
        error={read.error}
        loading={read.loading}
        onRetry={read.refresh}
      >
        <div className={`${styles.card} ${localStyles.card}`}>
          <div
            aria-label={t.keysTitle}
            className={styles.tableWrap}
            role="region"
            tabIndex={0}
          >
            <table className={`${styles.table} ${localStyles.keysTable}`}>
              <thead>
                <tr>
                  <th>{t.keySlot}</th>
                  <th>{t.slotState}</th>
                  <th>{copy.usage}</th>
                  <th>{copy.location}</th>
                  <th className={styles.actionHeader}>{t.action}</th>
                </tr>
              </thead>
              <tbody>
                {read.data?.items.map((item) => (
                  <tr
                    className={`${styles.row} ${localStyles.row}`}
                    key={item.keySlotId}
                  >
                    <td className={styles.primaryText}>
                      <bdi dir="ltr">{item.code}</bdi>
                    </td>
                    <td>
                      <StatusBadge
                        tone={item.slotStatus === "ACTIVE" ? "good" : "neutral"}
                      >
                        {keyStatusLabel(item.slotStatus, locale)}
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          item.holdingSessionId === null ? "neutral" : "info"
                        }
                      >
                        {keyUsageLabel(item.holdingSessionId, locale)}
                      </StatusBadge>
                    </td>
                    <td>
                      <bdi>{location?.name}</bdi>
                    </td>
                    <td className={styles.actionCell}>
                      <DetailAction
                        label={`${t.details}: ${t.keySlot} ${item.code}`}
                        onClick={() => setSelected(item)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ReferenceCursorControls
            canNext={Boolean(read.data?.nextCursor)}
            canPrevious={page.canPrevious}
            label={`${t.currentPageOnly}: ${read.data?.items.length ?? 0}`}
            onNext={() => {
              setSelected(null);
              page.next(read.data?.nextCursor ?? null);
            }}
            onPrevious={() => {
              setSelected(null);
              page.previous();
            }}
            size="keys"
          />
        </div>
      </ReadState>
      {selected && !read.error && !read.loading ? (
        <KeyDrawer
          item={selected}
          locationName={location?.name ?? ""}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function KeyDrawer({
  item,
  locationName,
  onClose,
}: {
  readonly item: KeySlotOverviewEntry;
  readonly locationName: string;
  readonly onClose: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const copy = keyCopy(locale);
  return (
    <OperationsDrawer label={`${t.keySlot} ${item.code}`} onClose={onClose}>
      <FactList>
        <Fact label={t.keySlot} value={<bdi dir="ltr">{item.code}</bdi>} />
        <Fact label={copy.location} value={<bdi>{locationName}</bdi>} />
        <Fact
          label={copy.usage}
          value={keyUsageLabel(item.holdingSessionId, locale)}
        />
        <Fact label={t.slotId} value={<bdi dir="ltr">{item.keySlotId}</bdi>} />
        <Fact
          label={t.slotState}
          value={
            <StatusBadge
              tone={item.slotStatus === "ACTIVE" ? "good" : "neutral"}
            >
              {keyStatusLabel(item.slotStatus, locale)}
            </StatusBadge>
          }
        />
        <Fact
          label={t.holdingSession}
          value={
            item.holdingSessionId ? (
              <bdi dir="ltr">{item.holdingSessionId}</bdi>
            ) : (
              t.emptySlot
            )
          }
        />
      </FactList>
      <p className={localStyles.note}>{copy.note}</p>
    </OperationsDrawer>
  );
}
