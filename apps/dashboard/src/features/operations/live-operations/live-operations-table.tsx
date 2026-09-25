"use client";

import type { ManagementLocation, SessionOverviewEntry } from "@valet/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import { operationsCopy } from "../operations-copy";
import { sessionTone } from "../operations-labels";
import {
  DetailAction,
  Fact,
  FactList,
  OperationsDrawer,
  StatusBadge,
  styles,
} from "../operations-ui";
import {
  filterLiveSessions,
  formatLiveOperationsTime,
  liveAssignmentLabel,
  liveSessionStateLabel,
  liveVehicleLabel,
  type LiveOperationsFilter,
} from "./live-operations-presentation";

interface LiveOperationsTableProps {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly error: Error | null;
  readonly filter: LiveOperationsFilter;
  readonly items: readonly SessionOverviewEntry[];
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly location: ManagementLocation;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onRetry: () => void;
}

export function LiveOperationsTable(props: LiveOperationsTableProps) {
  const t = operationsCopy(props.locale);
  const rows = filterLiveSessions(props.items, props.filter);
  const emptyText =
    props.items.length === 0 ? t.noData : t.noMatchingLoadedPage;
  return (
    <div className={`${styles.card} ${styles.liveTableCard}`}>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.liveTable}`}>
          <thead>
            <tr>
              <th>{t.vehicle}</th>
              <th>{t.assignee}</th>
              <th>{t.location}</th>
              <th>{t.state}</th>
              <th>{t.updated}</th>
              <th className={styles.actionHeader}>{t.action}</th>
            </tr>
          </thead>
          <tbody>
            {props.loading ? (
              <StateRow text={t.loading} />
            ) : props.error ? (
              <tr>
                <td className={styles.liveStateCell} colSpan={6}>
                  <div className={styles.liveInlineError} role="alert">
                    <span>{props.error.message}</span>
                    <button
                      className={styles.secondary}
                      onClick={props.onRetry}
                      type="button"
                    >
                      {t.retry}
                    </button>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <StateRow text={emptyText} />
            ) : (
              rows.map((item) => (
                <LiveOperationsRow
                  item={item}
                  key={item.sessionId}
                  locale={props.locale}
                  location={props.location}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      <LiveCursorControls {...props} />
    </div>
  );
}

function StateRow({ text }: { readonly text: string }) {
  return (
    <tr>
      <td className={styles.liveStateCell} colSpan={6}>{text}</td>
    </tr>
  );
}

function LiveOperationsRow({
  item,
  locale,
  location,
}: {
  readonly item: SessionOverviewEntry;
  readonly locale: DashboardLocale;
  readonly location: ManagementLocation;
}) {
  const t = operationsCopy(locale);
  const [open, setOpen] = useState(false);
  const vehicle = liveVehicleLabel(item) ?? t.plateUnavailable;
  return (
    <>
      <tr className={styles.row}>
        <td><div className={styles.primaryText}><bdi dir="ltr">{vehicle}</bdi></div></td>
        <td>{liveAssignmentLabel(item.currentAssigneeMembershipId, locale)}</td>
        <td>
          <div className={styles.primaryText}>{location.name}</div>
          <div className={styles.muted}><bdi dir="ltr">{location.code}</bdi></div>
        </td>
        <td>
          <StatusBadge tone={sessionTone(item.state)}>
            {liveSessionStateLabel(item.state, locale)}
          </StatusBadge>
        </td>
        <td><bdi dir={locale === "ar" ? "rtl" : "ltr"}>{formatLiveOperationsTime(item.updatedAt, location.timezone, locale)}</bdi></td>
        <td className={styles.actionCell}>
          <DetailAction
            label={`${t.details}: ${vehicle}`}
            onClick={() => setOpen(true)}
          />
        </td>
      </tr>
      {open ? (
        <SessionDrawer
          item={item}
          locale={locale}
          location={location}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function SessionDrawer({
  item,
  locale,
  location,
  onClose,
}: {
  readonly item: SessionOverviewEntry;
  readonly locale: DashboardLocale;
  readonly location: ManagementLocation;
  readonly onClose: () => void;
}) {
  const t = operationsCopy(locale);
  const vehicle = liveVehicleLabel(item) ?? t.plateUnavailable;
  const time = (value: string) =>
    formatLiveOperationsTime(value, location.timezone, locale);
  return (
    <OperationsDrawer label={t.details} onClose={onClose} subtitle={<bdi dir="ltr">{item.sessionId}</bdi>}>
      <FactList>
        <Fact label={t.vehicle} value={<bdi dir="ltr">{vehicle}</bdi>} />
        <Fact label={t.sessionId} value={<bdi dir="ltr">{item.sessionId}</bdi>} />
        <Fact label={t.vehicleId} value={<bdi dir="ltr">{item.vehicle.vehicleId}</bdi>} />
        <Fact label={t.state} value={<StatusBadge tone={sessionTone(item.state)}>{liveSessionStateLabel(item.state, locale)}</StatusBadge>} />
        <Fact label={t.membershipId} value={item.currentAssigneeMembershipId ? <bdi dir="ltr">{item.currentAssigneeMembershipId}</bdi> : "—"} />
        <Fact label={t.keySlotId} value={item.keySlotId ? <bdi dir="ltr">{item.keySlotId}</bdi> : "—"} />
        <Fact label={t.parkingSpotId} value={item.parkingSpotId ? <bdi dir="ltr">{item.parkingSpotId}</bdi> : "—"} />
        <Fact label={t.created} value={<bdi dir={locale === "ar" ? "rtl" : "ltr"}>{time(item.createdAt)}</bdi>} />
        <Fact label={t.updated} value={<bdi dir={locale === "ar" ? "rtl" : "ltr"}>{time(item.updatedAt)}</bdi>} />
      </FactList>
    </OperationsDrawer>
  );
}

function LiveCursorControls(props: LiveOperationsTableProps) {
  const t = operationsCopy(props.locale);
  const PreviousIcon = props.locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = props.locale === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div className={styles.livePagination}>
      <span>{t.loadedCursorPage}</span>
      <div className={styles.cursorButtons}>
        <button aria-label={t.previous} className={styles.cursorSquare32} disabled={!props.canPrevious || props.loading} onClick={props.onPrevious} type="button"><PreviousIcon size={16} /></button>
        <button aria-label={t.next} className={styles.cursorSquare32} disabled={!props.canNext || props.loading} onClick={props.onNext} type="button"><NextIcon size={16} /></button>
      </div>
    </div>
  );
}
