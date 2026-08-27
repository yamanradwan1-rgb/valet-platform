"use client";

import { useState } from "react";
import type { IncidentOverviewEntry } from "@valet/contracts";

import { EmptyState, ErrorState } from "../../components/ui/empty-state";
import { PageHeader } from "../../components/ui/page-header";
import { Skeleton } from "../../components/ui/skeleton";
import { StatusBadge } from "../../components/ui/status-badge";
import {
  DataCell,
  MobileDataRow,
  TableShell,
} from "../../components/ui/table-primitives";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import { useTranslation } from "../../i18n/locale-provider";

import { DetailField, DetailSheet } from "./detail-sheet";
import { overviewErrorMessageKey } from "./error-message";
import { formatTimestamp } from "./format-datetime";
import { shortIdentifier } from "./format-identifier";
import { humanizeIncidentType } from "./incident-type";
import { KpiStat } from "./kpi-stat";
import { LoadMoreSection } from "./load-more-section";
import { fetchIncidentsPage } from "./overview-endpoints";
import { useOverviewCursorList } from "./use-overview-cursor-list";

const UNRESOLVED_MARKER = "—";

/**
 * Incidents — read-only current/open incident monitoring.
 *
 * The backend current-incidents query intentionally returns only OPEN and
 * INVESTIGATING records; this surface therefore never promises resolved or
 * closed history and exposes no creation/resolution mutations. `resolvedAt`
 * being null is rendered as unresolved (em dash in tables, explicit label in
 * the detail sheet), never as a fabricated timestamp.
 */
export function IncidentsMonitoringView() {
  const { t, locale } = useTranslation();
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? null;
  const timeZone = location?.timezone;
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    null,
  );

  const list = useOverviewCursorList<IncidentOverviewEntry>({
    enabled: locationId !== null,
    resetKey: locationId,
    fetchPage: (cursor, signal) => {
      if (locationId === null) {
        return Promise.reject(new Error("overview location unconfigured"));
      }
      return fetchIncidentsPage(client, locationId, cursor, signal);
    },
  });

  const {
    status,
    items,
    nextCursor,
    error,
    paginationError,
    load,
    loadMore,
  } = list;
  const highCriticalCount = items.filter(
    (incident) => incident.severity === "HIGH" || incident.severity === "CRITICAL",
  ).length;
  const selected = items.find(
    (incident) => incident.incidentId === selectedIncidentId,
  );

  if (locationId === null) {
    return (
      <>
        <PageHeader
          title={t("page.incidents.title")}
          description={t("page.incidents.description")}
        />
        <p className="scope-note">{t("placeholder.locationMissingNote")}</p>
      </>
    );
  }

  const showInitialSkeleton =
    status === "idle" || (status === "loading" && items.length === 0);
  const showInitialError = status === "error" && items.length === 0;
  const showEmpty =
    !showInitialSkeleton && !showInitialError && items.length === 0;

  return (
    <>
      <PageHeader
        title={t("page.incidents.title")}
        description={t("page.incidents.description")}
      />
      <div className="overview-kpi-grid is-sm-four">
        <KpiStat label={t("page.incidents.kpiVisible")} value={items.length} />
        <KpiStat
          label={t("page.incidents.kpiHighCritical")}
          value={highCriticalCount}
          accentColor="var(--danger)"
        />
      </div>
      <p className="scope-note">{t("page.incidents.monitoringNote")}</p>

      {showInitialSkeleton && <Skeleton lines={6} label={t("states.loading")} />}
      {showInitialError && (
        <ErrorState
          message={t(overviewErrorMessageKey(error))}
          onRetry={load}
          retryLabel={t("actions.retry")}
        />
      )}
      {showEmpty && <EmptyState message={t("page.incidents.empty")} />}

      {items.length > 0 && (
        <>
          <div className="responsive-table-block">
            <TableShell
              minWidth={900}
              headers={[
                t("page.incidents.column.incidentId"),
                t("page.incidents.column.sessionId"),
                t("page.incidents.column.status"),
                t("page.incidents.column.severity"),
                t("page.incidents.column.type"),
                t("page.incidents.column.createdAt"),
                t("page.incidents.column.resolvedAt"),
              ]}
            >
              {items.map((incident) => (
                <tr
                  key={incident.incidentId}
                  className="is-clickable"
                  onClick={() => setSelectedIncidentId(incident.incidentId)}
                >
                  <DataCell mono>
                    {shortIdentifier(incident.incidentId)}
                  </DataCell>
                  <DataCell mono>
                    {shortIdentifier(incident.valetSessionId)}
                  </DataCell>
                  <DataCell>
                    <StatusBadge
                      variant="incident-status"
                      value={incident.status}
                    />
                  </DataCell>
                  <DataCell>
                    <StatusBadge
                      variant="incident-severity"
                      value={incident.severity}
                    />
                  </DataCell>
                  <DataCell>{humanizeIncidentType(incident.type)}</DataCell>
                  <DataCell>
                    {formatTimestamp(incident.createdAt, locale, timeZone)}
                  </DataCell>
                  <DataCell>
                    {incident.resolvedAt === null
                      ? UNRESOLVED_MARKER
                      : formatTimestamp(incident.resolvedAt, locale, timeZone)}
                  </DataCell>
                </tr>
              ))}
            </TableShell>
          </div>
          <div className="responsive-list-block">
            {items.map((incident) => (
              <MobileDataRow
                key={incident.incidentId}
                title={humanizeIncidentType(incident.type)}
                subtitle={shortIdentifier(incident.incidentId)}
                trailing={
                  <StatusBadge
                    variant="incident-severity"
                    value={incident.severity}
                  />
                }
                fields={[
                  {
                    label: t("page.incidents.column.status"),
                    value: t(`enum.incident.${incident.status}`),
                  },
                  {
                    label: t("page.incidents.column.createdAt"),
                    value: formatTimestamp(incident.createdAt, locale, timeZone),
                  },
                  {
                    label: t("page.incidents.column.resolvedAt"),
                    value:
                      incident.resolvedAt === null
                        ? UNRESOLVED_MARKER
                        : formatTimestamp(incident.resolvedAt, locale, timeZone),
                  },
                ]}
              />
            ))}
          </div>
          <LoadMoreSection
            nextCursor={nextCursor}
            isLoadingMore={status === "loadingMore"}
            paginationError={paginationError}
            onLoadMore={loadMore}
          />
        </>
      )}

      {selected !== undefined && (
        <DetailSheet
          title={t("page.incidents.detailTitle")}
          closeLabel={t("common.close")}
          onClose={() => setSelectedIncidentId(null)}
        >
          <DetailField label={t("page.incidents.column.incidentId")} mono>
            {selected.incidentId}
          </DetailField>
          <DetailField label={t("page.incidents.column.sessionId")} mono>
            {selected.valetSessionId}
          </DetailField>
          <DetailField label={t("page.incidents.column.status")}>
            <StatusBadge
              variant="incident-status"
              value={selected.status}
              size="md"
            />
          </DetailField>
          <DetailField label={t("page.incidents.column.severity")}>
            <StatusBadge
              variant="incident-severity"
              value={selected.severity}
              size="md"
            />
          </DetailField>
          <DetailField label={t("page.incidents.column.type")}>
            {humanizeIncidentType(selected.type)}
          </DetailField>
          <DetailField label={t("page.incidents.field.rawType")} mono>
            {selected.type}
          </DetailField>
          <DetailField label={t("page.incidents.field.description")}>
            {selected.description}
          </DetailField>
          <DetailField label={t("page.incidents.column.createdAt")}>
            {formatTimestamp(selected.createdAt, locale, timeZone)}
          </DetailField>
          <DetailField label={t("page.incidents.column.resolvedAt")}>
            {selected.resolvedAt === null
              ? t("page.incidents.unresolved")
              : formatTimestamp(selected.resolvedAt, locale, timeZone)}
          </DetailField>
        </DetailSheet>
      )}
    </>
  );
}
