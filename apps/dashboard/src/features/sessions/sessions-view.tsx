"use client";

import { useState } from "react";

import { useAuth } from "../../features/auth/use-auth";
import { useDashboardLocation } from "../../features/location/location-context";
import { EmptyState, ErrorState } from "../../components/ui/empty-state";
import { ListCardButton } from "../../components/ui/list-card-button";
import { LoadMoreButton } from "../../components/ui/load-more-button";
import { Skeleton } from "../../components/ui/skeleton";
import { StatusBadge } from "../../components/ui/status-badge";
import { TableShell } from "../../components/ui/table-primitives";
import { apiErrorMessageKey } from "../../lib/api/api-error-message";
import { useCursorList } from "../../lib/api/use-cursor-list";
import { formatTimestamp } from "../../lib/format/datetime-format";
import { useTranslation } from "../../i18n/locale-provider";
import {
  applySessionStateFilter,
  SESSION_STATE_FILTER_OPTIONS,
  type SessionStateFilterValue,
} from "./session-state-filters";
import { SessionDetailSheet } from "./session-detail-sheet";
import {
  assigneeCellText,
  optionalIdOrDash,
  sessionIdCell,
  sessionFilterLabelKey,
  vehicleDisplayLabel,
} from "./sessions-display";
import { createSessionsFetcher } from "./sessions-api";

const TABLE_MIN_WIDTH = 980;

/**
 * Vehicles in Service: sessions currently in service for the selected
 * location. COMPLETED is intentionally absent — the backend list excludes it.
 */
export function SessionsView() {
  const { client } = useAuth();
  const location = useDashboardLocation();
  const { t, locale } = useTranslation();

  const [filter, setFilter] = useState<SessionStateFilterValue>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const locationId = location?.locationId ?? null;
  const list = useCursorList({
    fetchPage:
      locationId === null
        ? null
        : createSessionsFetcher(client, locationId),
    keyOf: (entry) => entry.sessionId,
    resetKey: locationId,
  });

  if (locationId === null) {
    return (
      <EmptyState message={t("placeholder.locationMissingNote")} />
    );
  }

  const rows = applySessionStateFilter(list.items, filter);
  const selected =
    selectedId === null
      ? null
      : (list.items.find((entry) => entry.sessionId === selectedId) ?? null);

  return (
    <>
      <p className="contract-note">{t("page.sessions.contractNote")}</p>

      <div
        className="filter-chip-row"
        role="group"
        aria-label={t("sessions.filterGroup")}
      >
        {SESSION_STATE_FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className="filter-chip"
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            {option === "ALL"
              ? t("sessions.filterAll")
              : t(sessionFilterLabelKey(option))}
          </button>
        ))}
      </div>
      <p className="list-scope-hint">{t("sessions.filterScopeHint")}</p>

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
                t("sessions.column.vehicle"),
                t("sessions.column.state"),
                t("sessions.column.created"),
                t("sessions.column.updated"),
                t("sessions.column.parkingSpotId"),
                t("sessions.column.keySlotId"),
                t("sessions.column.assignee"),
              ]}
              minWidth={TABLE_MIN_WIDTH}
            >
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message={t("sessions.empty")} />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.sessionId}
                    className="is-clickable-row"
                    onClick={() => setSelectedId(row.sessionId)}
                  >
                    <td>
                      <span className="cell-stack cell-primary">
                        {vehicleDisplayLabel(
                          row,
                          t("sessions.fallback.unnamedVehicle"),
                        )}
                      </span>
                      <span className="cell-id">{sessionIdCell(row)}</span>
                    </td>
                    <td>
                      <StatusBadge variant="session" value={row.state} />
                    </td>
                    <td>{formatTimestamp(row.createdAt, locale)}</td>
                    <td>{formatTimestamp(row.updatedAt, locale)}</td>
                    <td className="cell-mono">
                      {optionalIdOrDash(row.parkingSpotId)}
                    </td>
                    <td className="cell-mono">
                      {optionalIdOrDash(row.keySlotId)}
                    </td>
                    <td className="cell-mono">
                      {assigneeCellText(
                        row.currentAssigneeMembershipId,
                        t("fallback.unassigned"),
                      )}
                    </td>
                  </tr>
                ))
              )}
            </TableShell>
          </section>

          <div className="mobile-data-list is-mobile-list">
            {rows.length === 0 ? (
              <EmptyState message={t("sessions.empty")} />
            ) : (
              rows.map((row) => (
                <ListCardButton
                  key={row.sessionId}
                  title={vehicleDisplayLabel(
                    row,
                    t("sessions.fallback.unnamedVehicle"),
                  )}
                  subtitle={sessionIdCell(row)}
                  trailing={<StatusBadge variant="session" value={row.state} />}
                  onClick={() => setSelectedId(row.sessionId)}
                  fields={[
                    {
                      label: t("sessions.column.created"),
                      value: formatTimestamp(row.createdAt, locale),
                    },
                    {
                      label: t("sessions.column.updated"),
                      value: formatTimestamp(row.updatedAt, locale),
                    },
                    {
                      label: t("sessions.column.parkingSpotId"),
                      value: optionalIdOrDash(row.parkingSpotId),
                    },
                    {
                      label: t("sessions.column.keySlotId"),
                      value: optionalIdOrDash(row.keySlotId),
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
        <SessionDetailSheet
          entry={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
