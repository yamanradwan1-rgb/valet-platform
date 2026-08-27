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
import { taskStatusLabelKey } from "../../i18n/enum-labels";
import { shortIdentifier } from "../../lib/format/identifier-format";
import { useTranslation } from "../../i18n/locale-provider";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import { RetrievalQueueDetailSheet } from "./retrieval-queue-detail-sheet";
import {
  queueAssigneeCellText,
  requestIdCell,
  requesterLabelKeyOf,
} from "./retrieval-queue-display";
import { createRetrievalQueueFetcher } from "./retrieval-queue-api";

const TABLE_MIN_WIDTH = 920;

/**
 * Vehicle Retrieval Queue: current OPEN/ACCEPTED retrieval requests, oldest
 * first, with the current task facts when one exists. Read-only projection.
 */
export function RetrievalQueueView() {
  const { client } = useAuth();
  const location = useDashboardLocation();
  const { t, locale } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const locationId = location?.locationId ?? null;
  const timeZone = location?.timezone;
  const list = useCursorList({
    fetchPage:
      locationId === null
        ? null
        : createRetrievalQueueFetcher(client, locationId),
    keyOf: (entry) => entry.requestId,
    resetKey: locationId,
  });

  if (locationId === null) {
    return <EmptyState message={t("placeholder.locationMissingNote")} />;
  }

  const selected =
    selectedId === null
      ? null
      : (list.items.find((entry) => entry.requestId === selectedId) ?? null);

  return (
    <>
      <p className="contract-note">{t("page.retrievalQueue.contractNote")}</p>

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
                t("retrievalQueue.column.requestId"),
                t("retrievalQueue.column.requestedAt"),
                t("retrievalQueue.column.status"),
                t("retrievalQueue.column.requester"),
                t("retrievalQueue.column.sessionId"),
                t("retrievalQueue.column.taskStatus"),
                t("retrievalQueue.column.assignee"),
              ]}
              minWidth={TABLE_MIN_WIDTH}
            >
              {list.items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message={t("retrievalQueue.empty")} />
                  </td>
                </tr>
              ) : (
                list.items.map((row) => {
                  const assignee = queueAssigneeCellText(
                    row,
                    t("fallback.unassigned"),
                  );
                  return (
                    <tr
                      key={row.requestId}
                      className="is-clickable-row"
                      onClick={() => setSelectedId(row.requestId)}
                    >
                      <td className="cell-mono">{requestIdCell(row)}</td>
                      <td>{formatTimestamp(row.requestedAt, locale, timeZone)}</td>
                      <td>
                        <StatusBadge variant="retrieval" value={row.status} />
                      </td>
                      <td>{t(requesterLabelKeyOf(row))}</td>
                      <td className="cell-mono">
                        {shortIdentifier(row.valetSessionId)}
                      </td>
                      <td>
                        {row.task === null ? (
                          <span className="inline-fallback">—</span>
                        ) : (
                          <StatusBadge variant="task" value={row.task.status} />
                        )}
                      </td>
                      <td className="cell-mono">
                        {assignee ?? t("fallback.unassigned")}
                      </td>
                    </tr>
                  );
                })
              )}
            </TableShell>
          </section>

          <div className="mobile-data-list is-mobile-list">
            {list.items.length === 0 ? (
              <EmptyState message={t("retrievalQueue.empty")} />
            ) : (
              list.items.map((row) => (
                <ListCardButton
                  key={row.requestId}
                  title={requestIdCell(row)}
                  subtitle={formatTimestamp(row.requestedAt, locale, timeZone)}
                  trailing={
                    <StatusBadge variant="retrieval" value={row.status} />
                  }
                  onClick={() => setSelectedId(row.requestId)}
                  fields={[
                    {
                      label: t("retrievalQueue.column.requester"),
                      value: t(requesterLabelKeyOf(row)),
                    },
                    {
                      label: t("retrievalQueue.column.sessionId"),
                      value: shortIdentifier(row.valetSessionId),
                    },
                    {
                      label: t("retrievalQueue.column.taskStatus"),
                      value:
                        row.task === null
                          ? "—"
                          : t(taskStatusLabelKey(row.task.status)),
                    },
                    {
                      label: t("retrievalQueue.column.assignee"),
                      value:
                        queueAssigneeCellText(row, t("fallback.unassigned")) ??
                        t("fallback.unassigned"),
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
        <RetrievalQueueDetailSheet
          entry={selected}
          timeZone={timeZone}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
