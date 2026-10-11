"use client";

import type { DashboardTaskStatus, TaskOverviewEntry } from "@valet/contracts";
import { useCallback, useState } from "react";
import { TaskTableBody } from "./task-table-body";
import { TaskDrawer } from "./task-drawer";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { readTasks } from "../operations-api";
import { selectedOperationsLocation } from "../operations-location";
import { operationsCopy } from "../operations-copy";
import {
  operationsTaskStatusLabel,
  operationsTaskTypeLabel,
  r04PresentationCopy,
} from "../operations-presentation";
import { OperationsPage, styles } from "../operations-ui";
import { ReferenceCursorControls } from "../reference-cursor-controls";
import listStyles from "../reference-list.module.css";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

type StatusFilter = DashboardTaskStatus | "ALL";
type TypeFilter = TaskOverviewEntry["taskType"] | "ALL";
const taskStatuses: readonly DashboardTaskStatus[] = [
  "QUEUED",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
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
  const enabled =
    exactLocation &&
    location !== null &&
    (scope.authority === "COMPANY_ADMIN" ||
      scope.authority === "LOCATION_MANAGER");
  const load = useCallback(
    (signal: AbortSignal) =>
      readTasks(dashboard.api, locationId, page.cursor, signal),
    [dashboard.api, locationId, page.cursor],
  );
  const read = useOperationsRead(
    `${scopeKey}:tasks:${page.cursor ?? "first"}`,
    load,
    enabled,
  );
  const sourceItems = read.data?.items ?? [];
  const items = sourceItems.filter(
    (item) =>
      (status === "ALL" || item.status === status) &&
      (type === "ALL" || item.taskType === type),
  );
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
    return (
      <OperationsPage subtitle={t.tasksSubtitle} title={t.tasksTitle}>
        <div className={`${styles.card} ${styles.state}`}>
          {t.exactLocation}
        </div>
      </OperationsPage>
    );
  }

  return (
    <OperationsPage help={<ScopedContextHelp helpKey="tasks.page" />} subtitle={t.tasksSubtitle} title={t.tasksTitle}>
      <div className={listStyles.toolbar}>
        <div className={listStyles.filters}>
          <span className={listStyles.locationControl}>{location.name}</span>
          <select
            aria-label={t.state}
            className={listStyles.select}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            value={status}
          >
            <option value="ALL">{r04.allStatuses}</option>
            {taskStatuses.map((value) => (
              <option key={value} value={value}>
                {operationsTaskStatusLabel(value, locale)}
              </option>
            ))}
          </select>
          <select
            aria-label={t.type}
            className={listStyles.select}
            onChange={(event) => setType(event.target.value as TypeFilter)}
            value={type}
          >
            <option value="ALL">{r04.allTaskTypes}</option>
            {taskTypes.map((value) => (
              <option key={value} value={value}>
                {operationsTaskTypeLabel(value, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className={[styles.helpNoteRow, styles.helpNoteRowPair].join(" ")}>
          <span className={listStyles.scopeNote}>
            {r04.filtersLoadedPageOnly}
          </span>
          <span className={styles.helpNoteAnchor}>
            <ScopedContextHelp helpKey="tasks.filters" />
            <ScopedContextHelp helpKey="tasks.table" />
          </span>
        </div>
      </div>
      <div className={listStyles.tableCard}>
        <div className={listStyles.tableWrap}>
          <table className={listStyles.table}>
            <thead>
              <tr>
                <th>{t.type}</th>
                <th>{t.assignee}</th>
                <th>{t.location}</th>
                <th>{t.state}</th>
                <th>{t.created}</th>
                <th className={styles.actionHeader}>{t.action}</th>
              </tr>
            </thead>
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
      {selected ? (
        <TaskDrawer
          help={<ScopedContextHelp helpKey="tasks.drawer" />}
          item={selected}
          locale={locale}
          location={location}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </OperationsPage>
  );
}
