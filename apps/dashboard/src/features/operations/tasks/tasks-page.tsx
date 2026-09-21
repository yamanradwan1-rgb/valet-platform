"use client";

import { useCallback, useState } from "react";
import type { TaskOverviewEntry } from "@valet/contracts";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readTasks } from "../operations-api";
import { operationsCopy } from "../operations-copy";
import { taskStatusLabel, taskTone } from "../operations-labels";
import {
  CursorControls, DetailAction, Fact, FactList, OperationsDrawer, OperationsPage,
  ReadState, StatusBadge, styles,
} from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

export function TasksPage() {
  const { scopeKey } = useOperationsContext();
  return <TasksContent key={scopeKey} />;
}

function TasksContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const [selected, setSelected] = useState<TaskOverviewEntry | null>(null);
  const locationId = scope.locationId ?? "";
  const enabled = exactLocation && (scope.authority === "COMPANY_ADMIN" || scope.authority === "LOCATION_MANAGER");
  const load = useCallback((signal: AbortSignal) =>
    readTasks(dashboard.api, locationId, page.cursor, signal),
  [dashboard.api, locationId, page.cursor]);
  const read = useOperationsRead(`${scopeKey}:tasks:${page.cursor ?? "first"}`, load, enabled);
  if (!enabled) return <OperationsPage subtitle={t.tasksSubtitle} title={t.tasksTitle}><div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div></OperationsPage>;
  return (
    <OperationsPage subtitle={t.tasksSubtitle} title={t.tasksTitle}>
      <div className={styles.referenceFilterBetween}>
        <div className={styles.filterGroup}>
          <span className={styles.filterPlaceholder}>{t.exactLocationLabel}</span>
          <span className={styles.filterPlaceholder}>{t.canonicalStatuses}</span>
          <span className={styles.filterPlaceholder}>PARKING / RETRIEVAL</span>
        </div>
      </div>
      <ReadState empty={read.data?.items.length === 0} error={read.error} loading={read.loading} onRetry={read.refresh}>
        <div className={styles.card}><div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{t.task}</th><th>{t.type}</th><th>{t.assignee}</th><th>{t.session}</th><th>{t.state}</th><th>{t.created}</th><th className={styles.actionHeader}>{t.action}</th></tr></thead>
          <tbody>{read.data?.items.map((item) => (
            <tr className={styles.row} key={item.taskId}>
              <td className={styles.primaryText}><bdi dir="ltr">{item.taskId}</bdi></td>
              <td>{item.taskType}</td>
              <td>{item.currentAssigneeMembershipId ? <bdi dir="ltr">{item.currentAssigneeMembershipId}</bdi> : t.unassigned}</td>
              <td><bdi dir="ltr">{item.valetSessionId}</bdi></td>
              <td><StatusBadge tone={taskTone(item.status)}>{taskStatusLabel(item.status)}</StatusBadge></td>
              <td><bdi dir="ltr">{item.createdAt}</bdi></td>
              <td className={styles.actionCell}><DetailAction label={t.details} onClick={() => setSelected(item)} /></td>
            </tr>
          ))}</tbody>
        </table></div><CursorControls canNext={Boolean(read.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => page.next(read.data?.nextCursor ?? null)} onPrevious={page.previous} /></div>
      </ReadState>
      {selected ? <TaskDrawer item={selected} onClose={() => setSelected(null)} /> : null}
    </OperationsPage>
  );
}

function TaskDrawer({ item, onClose }: { readonly item: TaskOverviewEntry; readonly onClose: () => void }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return <OperationsDrawer label={t.tasksTitle} onClose={onClose} subtitle={<bdi dir="ltr">{item.taskId}</bdi>}><FactList>
    <Fact label={t.type} value={item.taskType} />
    <Fact label={t.state} value={<StatusBadge tone={taskTone(item.status)}>{taskStatusLabel(item.status)}</StatusBadge>} />
    <Fact label={t.assignee} value={item.currentAssigneeMembershipId ? <bdi dir="ltr">{item.currentAssigneeMembershipId}</bdi> : t.unassigned} />
    <Fact label={t.session} value={<bdi dir="ltr">{item.valetSessionId}</bdi>} />
    <Fact label={t.created} value={<bdi dir="ltr">{item.createdAt}</bdi>} />
    <Fact label={t.updated} value={<bdi dir="ltr">{item.updatedAt}</bdi>} />
  </FactList></OperationsDrawer>;
}
