"use client";

import { useState } from "react";

import { EmptyState, ErrorState } from "../../components/ui/empty-state";
import { ListCardButton } from "../../components/ui/list-card-button";
import { LoadMoreButton } from "../../components/ui/load-more-button";
import { Skeleton } from "../../components/ui/skeleton";
import { StatusBadge } from "../../components/ui/status-badge";
import { TableShell } from "../../components/ui/table-primitives";
import { apiErrorMessageKey } from "../../lib/api/api-error-message";
import { useCursorList } from "../../lib/api/use-cursor-list";
import { formatTimestamp } from "../../lib/format/datetime-format";
import { shortIdentifier } from "../../lib/format/identifier-format";
import { useTranslation } from "../../i18n/locale-provider";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import { TaskDetailSheet } from "./task-detail-sheet";
import {
  taskAssigneeCellText,
  taskIdCell,
  taskTypeLabelKeyOf,
} from "./tasks-display";
import { createTasksFetcher } from "./tasks-api";

const TABLE_MIN_WIDTH = 920;

/**
 * Tasks: current parking and retrieval task facts for the selected location.
 * Read-only; the dashboard exposes no dispatch mutations for these routes.
 */
export function TasksView() {
  const { client } = useAuth();
  const location = useDashboardLocation();
  const { t, locale } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const locationId = location?.locationId ?? null;
  const list = useCursorList({
    fetchPage:
      locationId === null ? null : createTasksFetcher(client, locationId),
    keyOf: (entry) => entry.taskId,
    resetKey: locationId,
  });

  if (locationId === null) {
    return <EmptyState message={t("placeholder.locationMissingNote")} />;
  }

  const selected =
    selectedId === null
      ? null
      : (list.items.find((entry) => entry.taskId === selectedId) ?? null);

  return (
    <>
      <p className="contract-note">{t("page.tasks.contractNote")}</p>

      {list.phase === "loading" && <Skeleton lines={6} />}

      {list.phase === "error" && (
        <ErrorState
          message={t(apiErrorMessageKey(list.error))}
          onRetry={list.reload}
          retryLabel={t("common.retry")}
        />
      )}

      {list.phase === "ready" && (
        <>
          <section className="card is-desktop-table">
            <TableShell
              headers={[
                t("tasks.column.taskId"),
                t("tasks.column.type"),
                t("tasks.column.status"),
                t("tasks.column.sessionId"),
                t("tasks.column.assignee"),
                t("tasks.column.created"),
                t("tasks.column.updated"),
              ]}
              minWidth={TABLE_MIN_WIDTH}
            >
              {list.items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message={t("tasks.empty")} />
                  </td>
                </tr>
              ) : (
                list.items.map((row) => (
                  <tr
                    key={row.taskId}
                    className="is-clickable-row"
                    onClick={() => setSelectedId(row.taskId)}
                  >
                    <td className="cell-mono">{taskIdCell(row)}</td>
                    <td>{t(taskTypeLabelKeyOf(row))}</td>
                    <td>
                      <StatusBadge variant="task" value={row.status} />
                    </td>
                    <td className="cell-mono">
                      {shortIdentifier(row.valetSessionId)}
                    </td>
                    <td className="cell-mono">
                      {taskAssigneeCellText(
                        row,
                        t("fallback.unassigned"),
                      )}
                    </td>
                    <td>{formatTimestamp(row.createdAt, locale)}</td>
                    <td>{formatTimestamp(row.updatedAt, locale)}</td>
                  </tr>
                ))
              )}
            </TableShell>
          </section>

          <div className="mobile-data-list is-mobile-list">
            {list.items.length === 0 ? (
              <EmptyState message={t("tasks.empty")} />
            ) : (
              list.items.map((row) => (
                <ListCardButton
                  key={row.taskId}
                  title={t(taskTypeLabelKeyOf(row))}
                  subtitle={taskIdCell(row)}
                  trailing={<StatusBadge variant="task" value={row.status} />}
                  onClick={() => setSelectedId(row.taskId)}
                  fields={[
                    {
                      label: t("tasks.column.sessionId"),
                      value: shortIdentifier(row.valetSessionId),
                    },
                    {
                      label: t("tasks.column.assignee"),
                      value: taskAssigneeCellText(
                        row,
                        t("fallback.unassigned"),
                      ),
                    },
                    {
                      label: t("tasks.column.created"),
                      value: formatTimestamp(row.createdAt, locale),
                    },
                    {
                      label: t("tasks.column.updated"),
                      value: formatTimestamp(row.updatedAt, locale),
                    },
                  ]}
                />
              ))
            )}
          </div>

          {list.nextCursor !== null && (
            <LoadMoreButton
              onClick={list.loadMore}
              loading={list.loadingMore}
              label={t("common.loadMore")}
              loadingLabel={t("common.loadingMore")}
            />
          )}
          {list.moreError && (
            <p className="list-scope-hint" role="alert">
              {t("errors.moreFailed")}
            </p>
          )}
        </>
      )}

      {selected !== null && (
        <TaskDetailSheet entry={selected} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}
