"use client";

import type { ManagementLocation, RetrievalQueueEntry } from "@valet/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { OperationalStaff, operationalStaffName } from "../operational-staff";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import { operationsCopy } from "../operations-copy";
import { taskTone } from "../operations-labels";
import {
  DetailAction,
  Fact,
  FactList,
  OperationsDrawer,
  StatusBadge,
  styles,
} from "../operations-ui";
import {
  formatLiveOperationsTime,
  liveRequesterTypeLabel,
  liveRetrievalStatusLabel,
  liveTaskStatusLabel,
} from "./live-operations-presentation";

interface RetrievalQueueTableProps {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly error: Error | null;
  readonly items: readonly RetrievalQueueEntry[];
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly location: ManagementLocation;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onRetry: () => void;
}

export function RetrievalQueueTable(props: RetrievalQueueTableProps) {
  const t = operationsCopy(props.locale);
  return (
    <div className={`${styles.card} ${styles.liveTableCard}`}>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.liveTable}`}>
          <thead>
            <tr>
              <th>{t.requestedAt}</th>
              <th>{t.requester}</th>
              <th>{t.requestStatus}</th>
              <th>{t.taskState}</th>
              <th>{t.assignee}</th>
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
            ) : props.items.length === 0 ? (
              <StateRow text={t.noData} />
            ) : (
              props.items.map((item) => (
                <RetrievalRow
                  item={item}
                  key={item.requestId}
                  locale={props.locale}
                  location={props.location}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      <QueueCursorControls {...props} />
    </div>
  );
}

function StateRow({ text }: { readonly text: string }) {
  return (
    <tr>
      <td className={styles.liveStateCell} colSpan={6}>
        {text}
      </td>
    </tr>
  );
}

function RetrievalRow({
  item,
  locale,
  location,
}: {
  readonly item: RetrievalQueueEntry;
  readonly locale: DashboardLocale;
  readonly location: ManagementLocation;
}) {
  const t = operationsCopy(locale);
  const [open, setOpen] = useState(false);
  const taskStatus =
    item.task === null
      ? t.noTask
      : liveTaskStatusLabel(item.task.status, locale);
  return (
    <>
      <tr className={styles.row}>
        <td>
          <bdi dir={locale === "ar" ? "rtl" : "ltr"}>
            {formatLiveOperationsTime(
              item.requestedAt,
              location.timezone,
              locale,
            )}
          </bdi>
        </td>
        <td>{liveRequesterTypeLabel(item.requesterType, locale)}</td>
        <td>
          <StatusBadge tone={item.status === "OPEN" ? "warn" : "info"}>
            {liveRetrievalStatusLabel(item.status, locale)}
          </StatusBadge>
        </td>
        <td>
          {item.task === null ? (
            taskStatus
          ) : (
            <StatusBadge tone={taskTone(item.task.status)}>
              {taskStatus}
            </StatusBadge>
          )}
        </td>
        <td>
          <OperationalStaff
            assignee={item.task?.assignee ?? null}
            locale={locale}
          />
        </td>
        <td className={styles.actionCell}>
          <DetailAction
            label={`${t.details}: ${t.retrievalQueue}`}
            onClick={() => setOpen(true)}
          />
        </td>
      </tr>
      {open ? (
        <RetrievalDrawer
          item={item}
          locale={locale}
          location={location}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function RetrievalDrawer({
  item,
  locale,
  location,
  onClose,
}: {
  readonly item: RetrievalQueueEntry;
  readonly locale: DashboardLocale;
  readonly location: ManagementLocation;
  readonly onClose: () => void;
}) {
  const t = operationsCopy(locale);
  return (
    <OperationsDrawer label={t.retrievalQueue} onClose={onClose}>
      <FactList>
        <Fact label={t.request} value={<bdi dir="ltr">{item.requestId}</bdi>} />
        <Fact
          label={t.sessionId}
          value={<bdi dir="ltr">{item.valetSessionId}</bdi>}
        />
        <Fact
          label={t.requestedAt}
          value={
            <bdi dir={locale === "ar" ? "rtl" : "ltr"}>
              {formatLiveOperationsTime(
                item.requestedAt,
                location.timezone,
                locale,
              )}
            </bdi>
          }
        />
        <Fact
          label={t.requester}
          value={liveRequesterTypeLabel(item.requesterType, locale)}
        />
        <Fact
          label={t.requestStatus}
          value={liveRetrievalStatusLabel(item.status, locale)}
        />
        <Fact
          label={t.taskId}
          value={item.task ? <bdi dir="ltr">{item.task.taskId}</bdi> : "—"}
        />
        <Fact
          label={t.taskState}
          value={
            item.task ? liveTaskStatusLabel(item.task.status, locale) : t.noTask
          }
        />
        <Fact
          label={t.assignee}
          value={
            <bdi>
              {operationalStaffName(item.task?.assignee ?? null, locale)}
            </bdi>
          }
        />
        <Fact
          label={locale === "ar" ? "البريد الإلكتروني" : "Email"}
          value={
            <bdi dir="ltr">{item.task?.assignee?.identity.email ?? "—"}</bdi>
          }
        />
      </FactList>
    </OperationsDrawer>
  );
}

function QueueCursorControls(props: RetrievalQueueTableProps) {
  const t = operationsCopy(props.locale);
  const PreviousIcon = props.locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = props.locale === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div className={styles.livePagination}>
      <span>{t.retrievalPageOnly}</span>
      <div className={styles.cursorButtons}>
        <button
          aria-label={t.previous}
          className={styles.cursorSquare32}
          disabled={!props.canPrevious || props.loading}
          onClick={props.onPrevious}
          type="button"
        >
          <PreviousIcon size={16} />
        </button>
        <button
          aria-label={t.next}
          className={styles.cursorSquare32}
          disabled={!props.canNext || props.loading}
          onClick={props.onNext}
          type="button"
        >
          <NextIcon size={16} />
        </button>
      </div>
    </div>
  );
}
