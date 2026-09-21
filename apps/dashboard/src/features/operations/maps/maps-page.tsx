"use client";

import { Layers, RefreshCw } from "lucide-react";
import { useCallback } from "react";
import type { LiveOperationsMapResponse } from "@valet/contracts";

import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { readLocationManagerSubscription } from "../../../lib/scope/dashboard-scope";
import { readLiveMap } from "../operations-api";
import { operationsCopy } from "../operations-copy";
import {
  CursorControls, OperationsPage, StatusBadge, styles,
} from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";
import { CoordinateCanvas, PositionList } from "./coordinate-canvas";
import { MapSetupPanel } from "./map-setup-panel";
import { useMapSetupState } from "./use-map-setup-state";

export function MapsPage() {
  const { scopeKey } = useOperationsContext();
  return <MapsContent key={scopeKey} />;
}

function MapsContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const locationId = scope.locationId ?? "";
  const locationManager = exactLocation && scope.authority === "LOCATION_MANAGER";
  const companyAdmin = exactLocation && scope.authority === "COMPANY_ADMIN";
  const supervisor = exactLocation && scope.authority === "SUPERVISOR";
  const routeEligible = locationManager || companyAdmin || supervisor;

  const loadSubscription = useCallback(
    (signal: AbortSignal) => readLocationManagerSubscription(dashboard.api, locationId, signal),
    [dashboard.api, locationId],
  );
  const subscription = useOperationsRead(
    `${scopeKey}:maps:lm-subscription`,
    loadSubscription,
    locationManager,
  );
  const lmDashboardAccess =
    subscription.data?.subscription?.entitlements.dashboardAccess === true;
  const liveEnabled = routeEligible && (
    companyAdmin || supervisor || (locationManager && lmDashboardAccess)
  );
  const loadLive = useCallback(
    (signal: AbortSignal) => readLiveMap(dashboard.api, locationId, page.cursor, signal),
    [dashboard.api, locationId, page.cursor],
  );
  const live = useOperationsRead(
    `${scopeKey}:maps:live:${page.cursor ?? "first"}`,
    loadLive,
    liveEnabled,
  );
  const setup = useMapSetupState(dashboard.api, locationId, locationManager);
  const liveError = live.error ? liveErrorMessage(live.error, t.liveMapDenied) : null;
  const liveItems = live.data?.items ?? [];

  if (!routeEligible) {
    return <OperationsPage subtitle={t.mapsSubtitle} title={t.mapsTitle}><div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div></OperationsPage>;
  }
  return (
    <OperationsPage compact subtitle={t.mapsSubtitle} subtitleMargin="half" title={t.mapsTitle}>
      <div className={`${styles.card} ${styles.mapsToolbar}`}>
        <div className={styles.toolbar}>
          <div className={styles.filterGroup}>
            <span className={styles.filterPlaceholder}>{t.exactLocationLabel}</span>
            <span className={styles.filterPlaceholder}>{t.coordinateView}</span>
            <span className={styles.filterPlaceholder}>{t.operational}</span>
          </div>
          <button className={styles.secondary} disabled={!liveEnabled || live.loading} onClick={live.refresh} type="button"><RefreshCw aria-hidden="true" size={14} /> {t.refresh}</button>
        </div>
        <div className={styles.muted}>{live.data ? <><span>{t.observedAt}: </span><bdi dir="ltr">{live.data.observedAt}</bdi></> : t.coordinateDisclaimer}</div>
      </div>
      <div className={styles.mapsGrid}>
        <div>
          {locationManager && subscription.loading ? <div className={styles.setupStatus}>{t.loading}</div> : null}
          {locationManager && subscription.error ? <div className={styles.error} role="alert">{subscription.error.message}</div> : null}
          {locationManager && !subscription.loading && !subscription.error && !lmDashboardAccess ? <div className={styles.setupStatus} data-testid="lm-live-map-unavailable">{t.liveMapUnavailable}</div> : null}
          {liveError ? <div className={styles.error} role="alert">{liveError}</div> : null}
          {live.loading ? <div className={styles.setupStatus}>{t.loading}</div> : null}
          <CoordinateCanvas areas={locationManager ? setup.areas : undefined} items={liveItems} points={locationManager ? setup.points : undefined} />
          {liveEnabled && !live.loading && !live.error && liveItems.length === 0 ? <div className={styles.contextBand}>{t.noTrackedTasks}</div> : null}
          {live.data ? <CursorControls canNext={Boolean(live.data.nextCursor)} canPrevious={page.canPrevious} onNext={() => page.next(live.data?.nextCursor ?? null)} onPrevious={page.previous} /> : null}
          <PositionList items={liveItems} />
        </div>
        {locationManager ? (
          <MapSetupPanel
            api={dashboard.api}
            areas={setup.areas}
            error={setup.error}
            loading={setup.loading}
            locationId={locationId}
            points={setup.points}
            reload={setup.reload}
          />
        ) : <LiveMapSidebar items={liveItems} />}
      </div>
    </OperationsPage>
  );
}

type LiveMapItem = LiveOperationsMapResponse["items"][number];

function LiveMapSidebar({ items }: { readonly items: readonly LiveMapItem[] }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return (
    <aside className={`${styles.card} ${styles.mapSidebar}`}>
      <div className={styles.toolbar}><h2>{t.liveTitle}</h2><Layers aria-hidden="true" size={17} /></div>
      <div className={styles.list}>
        {items.length === 0 ? <div className={styles.muted}>{t.noTrackedTasks}</div> : items.map((item) => (
          <div className={styles.listItem} key={item.taskId}>
            <div className={styles.toolbar}><strong>{item.taskType}</strong><StatusBadge tone={item.position?.freshness === "LIVE" ? "good" : item.position ? "warn" : "neutral"}>{item.position?.freshness ?? t.noPosition}</StatusBadge></div>
            <div className={styles.muted}><bdi dir="ltr">{item.taskId}</bdi></div>
            <div className={styles.muted}><bdi dir="ltr">{item.vehicle.plateNumber ?? item.vehicle.temporaryDescriptor ?? item.vehicle.vehicleId}</bdi></div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function liveErrorMessage(error: Error, denied: string) {
  if (error instanceof DashboardApiError && (
    error.kind === "authorization" || error.kind === "entitlement"
  )) return denied;
  return error.message;
}
