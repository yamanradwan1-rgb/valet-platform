"use client";

import type { DashboardTaskStatus, ManagementLocation, TaskOverviewEntry } from "@valet/contracts";
import { useCallback, useState } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readTasks } from "../operations-api";
import { selectedOperationsLocation } from "../operations-location";
import { operationsCopy } from "../operations-copy";
import {
  formatOperationsTime,
  operationsAssignmentLabel,
  operationsTaskStatusLabel,
  operationsTaskTypeLabel,
  r04PresentationCopy,
} from "../operations-presentation";
import { taskTone } from "../operations-labels";
import {
  DetailAction,
  Fact,
  FactList,
  OperationsDrawer,
  OperationsPage,
  StatusBadge,
  styles,
} from "../operations-ui";
import { ReferenceCursorControls } from "../reference-cursor-controls";
import listStyles from "../reference-list.module.css";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

type StatusFilter = DashboardTaskStatus | "ALL";
type TypeFilter = TaskOverviewEntry["taskType"] | "ALL";
const taskStatuses: readonly DashboardTaskStatus[] = [
  "QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED",
];
const taskTypes = ["PARKING", "RETRIEVAL"] as const;

export function TasksPage() {
  const { scopeKey } = useOperationsContext();
  return <TasksContent key={scopeKey} />;
}

function TasksContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const r04 = r04PresentationCopy(locale);
  const page = useCursorPage();
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [type, setType] = useState<TypeFilter>("ALL");
  const [selected, setSelected] = useState<TaskOverviewEntry | null>(null);
  const location = selectedOperationsLocation(dashboard.selectedScope);
  const locationId = location?.locationId ?? "";
  const enabled = exactLocation && location !== null &&
    (scope.authority === "COMPANY_ADMIN" || scope.authority === "LOCATION_MANAGER");
  const load = useCallback(
    (signal: AbortSignal) => readTasks(dashboard.api, locationId, page.cursor, signal),
    [dashboard.api, locationId, page.cursor],
  );
  const read = useOperationsRead(`${scopeKey}:tasks:${page.cursor ?? "first"}`, load, enabled);
  const sourceItems = read.data?.items ?? [];
  const items = sourceItems.filter((item) =>
    (status === "ALL" || item.status === status) &&
    (type === "ALL" || item.taskType === type));
  const resetPageLocalState = () => {
    setStatus("ALL");
    setType("ALL");
    setSelected(null);
  };
  const nextPage = () => {
    const nextCursor = read.data?.nextCursor ?? null;
    if (nextCursor === null) return;
    resetPageLocalState();
    page.next(nextCursor);
  };
  const previousPage = () => {
    resetPageLocalState();
    page.previous();
  };

  if (!enabled || location === null) {
    return <OperationsPage subtitle={t.tasksSubtitle} title={t.tasksTitle}>
      <div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div>
    </OperationsPage>;
  }

  return (
    <OperationsPage subtitle={t.tasksSubtitle} title={t.tasksTitle}>
      <div className={listStyles.toolbar}>
        <div className={listStyles.filters}>
          <span className={listStyles.locationControl}>{location.name}</span>
          <select aria-label={t.state} className={listStyles.select} onChange={(event) => setStatus(event.target.value as StatusFilter)} value={status}>
            <option value="ALL">{r04.allStatuses}</option>
            {taskStatuses.map((value) => <option key={value} value={value}>{operationsTaskStatusLabel(value, locale)}</option>)}
          </select>
          <select aria-label={t.type} className={listStyles.select} onChange={(event) => setType(event.target.value as TypeFilter)} value={type}>
            <option value="ALL">{r04.allTaskTypes}</option>
            {taskTypes.map((value) => <option key={value} value={value}>{operationsTaskTypeLabel(value, locale)}</option>)}
          </select>
        </div>
        <span className={listStyles.scopeNote}>{r04.filtersLoadedPageOnly}</span>
      </div>
      <div className={listStyles.tableCard}>
        <div className={listStyles.tableWrap}>
          <table className={listStyles.table}>
            <thead><tr>
              <th>{t.type}</th>
              <th>{t.assignee}</th>
              <th>{t.location}</th>
              <th>{t.state}</th>
              <th>{t.created}</th>
              <th className={styles.actionHeader}>{t.action}</th>
            </tr></thead>
            <tbody>
              <TaskTableBody
                error={read.error}
                items={items}
                loading={read.loading}
                locale={locale}
                location={location}
                onRetry={read.refresh}
                onSelect={setSelected}
                sourceEmpty={sourceItems.length === 0}
              />
            </tbody>
          </table>
        </div>
        <ReferenceCursorControls
          canNext={Boolean(read.data?.nextCursor)}
          canPrevious={page.canPrevious}
          label={t.loadedCursorPage}
          loading={read.loading}
          locale={locale}
          onNext={nextPage}
          onPrevious={previousPage}
        />
      </div>
      {selected ? <TaskDrawer item={selected} locale={locale} location={location} onClose={() => setSelected(null)} /> : null}
    </OperationsPage>
  );
}

function TaskTableBody(props: {
  readonly error: Error | null;
  readonly items: readonly TaskOverviewEntry[];
  readonly loading: boolean;
  readonly locale: "en" | "ar";
  readonly location: ManagementLocation;
  readonly onRetry: () => void;
  readonly onSelect: (item: TaskOverviewEntry) => void;
  readonly sourceEmpty: boolean;
}) {
  const t = operationsCopy(props.locale);
  if (props.loading) return <StateRow text={t.loading} />;
  if (props.error) return <tr><td className={listStyles.stateCell} colSpan={6}>
    <div className={listStyles.inlineError} role="alert"><span>{props.error.message}</span><button className={styles.secondary} onClick={props.onRetry} type="button">{t.retry}</button></div>
  </td></tr>;
  if (props.items.length === 0) return <StateRow text={props.sourceEmpty ? t.noData : r04NoMatch(props.locale)} />;
  return <>{props.items.map((item) => <tr className={styles.row} key={item.taskId}>
    <td className={listStyles.primary}>{operationsTaskTypeLabel(item.taskType, props.locale)}</td>
    <td>{operationsAssignmentLabel(item.currentAssigneeMembershipId, props.locale)}</td>
    <td><div className={listStyles.primary}>{props.location.name}</div><div className={listStyles.secondary}><bdi dir="ltr">{props.location.code}</bdi></div></td>
    <td><StatusBadge tone={taskTone(item.status)}>{operationsTaskStatusLabel(item.status, props.locale)}</StatusBadge></td>
    <td><bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>{formatOperationsTime(item.createdAt, props.location.timezone, props.locale)}</bdi></td>
    <td className={styles.actionCell}><DetailAction label={`${t.details}: ${operationsTaskTypeLabel(item.taskType, props.locale)}`} onClick={() => props.onSelect(item)} /></td>
  </tr>)}</>;
}

function StateRow({ text }: { readonly text: string }) {
  return <tr><td className={listStyles.stateCell} colSpan={6}>{text}</td></tr>;
}

function r04NoMatch(locale: "en" | "ar") {
  return locale === "ar" ? "لا توجد مهام مطابقة في الصفحة المحمّلة." : "No matching tasks on this loaded page.";
}

function TaskDrawer(props: {
  readonly item: TaskOverviewEntry;
  readonly locale: "en" | "ar";
  readonly location: ManagementLocation;
  readonly onClose: () => void;
}) {
  const t = operationsCopy(props.locale);
  const time = (value: string) => formatOperationsTime(value, props.location.timezone, props.locale);
  return <OperationsDrawer label={t.details} onClose={props.onClose} subtitle={operationsTaskTypeLabel(props.item.taskType, props.locale)}><FactList>
    <Fact label={t.type} value={operationsTaskTypeLabel(props.item.taskType, props.locale)} />
    <Fact label={t.state} value={<StatusBadge tone={taskTone(props.item.status)}>{operationsTaskStatusLabel(props.item.status, props.locale)}</StatusBadge>} />
    <Fact label={t.assignee} value={operationsAssignmentLabel(props.item.currentAssigneeMembershipId, props.locale)} />
    <Fact label={t.location} value={props.location.name} />
    <Fact label={t.taskId} value={<bdi dir="ltr">{props.item.taskId}</bdi>} />
    <Fact label={t.sessionId} value={<bdi dir="ltr">{props.item.valetSessionId}</bdi>} />
    <Fact label={t.membershipId} value={props.item.currentAssigneeMembershipId ? <bdi dir="ltr">{props.item.currentAssigneeMembershipId}</bdi> : "—"} />
    <Fact label={t.created} value={<bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>{time(props.item.createdAt)}</bdi>} />
    <Fact label={t.updated} value={<bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>{time(props.item.updatedAt)}</bdi>} />
  </FactList></OperationsDrawer>;
}
