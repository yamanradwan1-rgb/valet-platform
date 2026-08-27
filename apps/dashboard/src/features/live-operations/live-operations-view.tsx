"use client";

import { useCallback, useMemo, useState } from "react";

import { Card, SectionHeader } from "../../components/ui/card";
import { EmptyState, ErrorState } from "../../components/ui/empty-state";
import { LoadMoreButton } from "../../components/ui/load-more-button";
import { PageHeader } from "../../components/ui/page-header";
import { Skeleton } from "../../components/ui/skeleton";
import { apiErrorMessageKey } from "../../lib/api/api-error-message";
import { DashboardApiError } from "../../lib/api/api-error";
import type { MapMarkerDescriptor } from "../../lib/maps/map-provider";
import { freshnessLabelKey, taskTypeLabelKey } from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";
import { formatTimestamp } from "../../lib/format/datetime-format";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import { LiveVehicleCard } from "./live-operations-card";
import { LiveOperationsMap } from "./live-operations-map";
import {
  countLiveOperations,
  toMarkerDrafts,
  vehicleDisplayName,
} from "./live-operations-view-model";
import { useLiveOperations } from "./use-live-operations";

/**
 * D3-001 — `/live-operations` on real backend data.
 *
 * GET /v1/staff/locations/:locationId/live-operations-map (cursor snapshot).
 * Composition mirrors the D1 final surface: header with snapshot time and
 * explicit refresh, four operational KPI tiles, privacy note, map panel with
 * backend-positioned markers only, and the tracked-vehicles list. Items
 * without a backend position remain fully visible in the list but never
 * become markers.
 */
export function LiveOperationsView() {
  const { client } = useAuth();
  const location = useDashboardLocation();
  const { t, locale } = useTranslation();
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const locationId = location?.locationId ?? null;
  const timeZone = location?.timezone;
  const { snapshot, refresh, retry, loadMore } = useLiveOperations(
    client,
    locationId,
  );

  const onSelectMarker = useCallback((id: string) => {
    setSelectedMarkerId(id);
  }, []);

  const handleCardSelect = useCallback((id: string) => {
    setSelectedMarkerId((current) => (current === id ? null : id));
  }, []);

  // A refresh replaces accumulated rows and a location change empties them;
  // the effective selection is derived from the loaded set so it can never
  // point at an item the current data no longer contains.
  const effectiveSelectedId = useMemo(() => {
    if (
      selectedMarkerId !== null &&
      snapshot.items.some(
        (candidate) => candidate.trackingSessionId === selectedMarkerId,
      )
    ) {
      return selectedMarkerId;
    }
    return null;
  }, [selectedMarkerId, snapshot.items]);

  const counts = useMemo(
    () => countLiveOperations(snapshot.items),
    [snapshot.items],
  );

  // Marker drafts are derived from loaded items; position=null items are
  // structurally excluded inside toMarkerDrafts (tested boundary).
  const markerDrafts = useMemo(
    () => toMarkerDrafts(snapshot.items, effectiveSelectedId),
    [snapshot.items, effectiveSelectedId],
  );

  // Localized accessible name for one marker; only backend-supported facts.
  const describeMarker = useCallback(
    (draft: Omit<MapMarkerDescriptor, "ariaLabel">): string => {
      const item = snapshot.items.find(
        (candidate) => candidate.trackingSessionId === draft.id,
      );
      if (item === undefined || item.position === null) return draft.glyph;
      return [
        t(taskTypeLabelKey(item.taskType)),
        vehicleDisplayName(
          item.vehicle,
          t("liveOperations.vehicle.fallbackName"),
        ),
        t(freshnessLabelKey(item.position.freshness)),
      ].join(" · ");
    },
    [snapshot.items, t],
  );

  if (locationId === null) {
    return (
      <div className="page-shell">
        <PageHeader
          description={t("page.liveOperations.description")}
          title={t("page.liveOperations.title")}
        />
        <EmptyState message={t("placeholder.locationMissingNote")} />
      </div>
    );
  }

  if (snapshot.phase === "error") {
    return (
      <div className="page-shell">
        <PageHeader
          description={t("page.liveOperations.description")}
          title={t("page.liveOperations.title")}
        />
        <FailureState error={snapshot.error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.liveOperations.description")}
        title={t("page.liveOperations.title")}
        actions={
          <>
            {snapshot.observedAt !== null && (
              <span className="liveops-observed tabular-nums">
                {t("liveOperations.observedAt")}:{" "}
                {formatTimestamp(snapshot.observedAt, locale, timeZone)}
              </span>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={refresh}
              disabled={snapshot.refreshing}
            >
              {snapshot.refreshing
                ? t("liveOperations.action.refreshing")
                : t("liveOperations.action.refresh")}
            </button>
          </>
        }
      />

      <p className="contract-note">{t("liveOperations.privacyNote")}</p>

      {snapshot.phase === "loading" ? (
        <Skeleton lines={8} label={t("states.loading")} />
      ) : (
        <>
          {snapshot.refreshFailed && (
            <p className="list-scope-hint" role="alert">
              {t("liveOperations.error.refreshFailed")}
            </p>
          )}

          <div className="liveops-kpis">
            <KpiTile
              accent={undefined}
              label={t("liveOperations.kpi.trackedTasks")}
              value={counts.trackedTasks}
            />
            <KpiTile
              accent={undefined}
              label={t("liveOperations.kpi.positionedVehicles")}
              value={counts.positionedCount}
            />
            <KpiTile
              accent="var(--success)"
              label={t("liveOperations.kpi.livePositions")}
              value={counts.liveCount}
            />
            <KpiTile
              accent={
                counts.staleCount > 0 ? "var(--warning)" : undefined
              }
              label={t("liveOperations.kpi.stalePositions")}
              value={counts.staleCount}
            />
          </div>

          {counts.trackedTasks === 0 ? (
            <EmptyState message={t("liveOperations.list.empty")} />
          ) : (
            <div className="liveops-grid">
              <Card>
                <SectionHeader title={t("liveOperations.map.title")} />
                <LiveOperationsMap
                  describeMarker={describeMarker}
                  locationId={locationId}
                  markers={markerDrafts}
                  selectedMarkerId={effectiveSelectedId}
                  onSelectMarker={onSelectMarker}
                />
              </Card>

              <div className="liveops-list">
                <div className="liveops-list-cards">
                  {snapshot.items.map((item) => (
                    <LiveVehicleCard
                      key={item.trackingSessionId}
                      item={item}
                      timeZone={timeZone}
                      selected={
                        item.position !== null &&
                        item.trackingSessionId === effectiveSelectedId
                      }
                      onSelect={handleCardSelect}
                    />
                  ))}
                </div>
                {snapshot.nextCursor !== null && (
                  <LoadMoreButton
                    loading={snapshot.loadingMore}
                    loadingLabel={t("common.loadingMore")}
                    label={t("common.loadMore")}
                    onClick={loadMore}
                  />
                )}
                {snapshot.moreError && (
                  <p className="list-scope-hint" role="alert">
                    {t("errors.moreFailed")}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FailureState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const kind = error instanceof DashboardApiError ? error.kind : "server";
  if (kind === "session-expired") {
    // The shell redirect to /session-expired is already in flight.
    return <Skeleton lines={6} />;
  }
  const retryable =
    kind !== "authorization-masked" && kind !== "forbidden";
  return (
    <ErrorState
      message={t(apiErrorMessageKey(error))}
      onRetry={retryable ? onRetry : undefined}
      retryLabel={retryable ? t("common.retry") : undefined}
    />
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string | undefined;
}) {
  return (
    <div className="liveops-kpi">
      <span className="liveops-kpi-label">{label}</span>
      <span
        className="liveops-kpi-value tabular-nums"
        style={accent === undefined ? undefined : { color: accent }}
      >
        {value}
      </span>
    </div>
  );
}
