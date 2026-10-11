"use client";

import { MapPin, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import type { LiveOperationsMapResponse } from "@valet/contracts";

import type { SelectedDashboardScope } from "../../../components/scope";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { readLocationManagerSubscription } from "../../../lib/scope/dashboard-scope";
import { useDashboardTheme } from "../../../lib/theme/theme-provider";
import { readLiveMap } from "../operations-api";
import { operationsCopy } from "../operations-copy";
import { formatOperationsTime } from "../operations-presentation";
import { OperationsPage, styles } from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";
import { LiveMapPanel } from "./live-map-panel";
import { MapSetupPanel } from "./map-setup-panel";
import reference from "./maps-reference.module.css";
import { OperationalGoogleMap } from "./operational-google-map";
import { useLiveMapRead } from "./use-live-map-read";
import { useMapSetupState } from "./use-map-setup-state";

type MapMode = "LIVE" | "SETUP";
type LiveMapItem = LiveOperationsMapResponse["items"][number];

export function MapsPage() {
  const { scopeKey } = useOperationsContext();
  return <MapsContent key={scopeKey} />;
}

function MapsContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const { theme } = useDashboardTheme();
  const t = operationsCopy(locale);
  const page = useCursorPage();
  const [mode, setMode] = useState<MapMode>("LIVE");
  const locationId = scope.locationId ?? "";
  const locationManager = exactLocation && scope.authority === "LOCATION_MANAGER";
  const companyAdmin = exactLocation && scope.authority === "COMPANY_ADMIN";
  const supervisor = exactLocation && scope.authority === "SUPERVISOR";
  const routeEligible = locationManager || companyAdmin || supervisor;
  const location = selectedMapLocation(dashboard.selectedScope);

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
  const setup = useMapSetupState(
    dashboard.api,
    locationId,
    locationManager,
    scopeKey,
  );
  const setupForced = locationManager &&
    !subscription.loading &&
    !subscription.error &&
    !lmDashboardAccess;
  const setupMode = locationManager && (mode === "SETUP" || setupForced);
  const loadLive = useCallback(
    (signal: AbortSignal) => readLiveMap(dashboard.api, locationId, page.cursor, signal),
    [dashboard.api, locationId, page.cursor],
  );
  const live = useLiveMapRead(
    `${scopeKey}:maps:live:${page.cursor ?? "first"}`,
    loadLive,
    liveEnabled && !setupMode,
  );
  const liveError = live.error ? liveErrorMessage(live.error, t.liveMapDenied) : null;
  const liveItems = live.data?.items ?? [];
  const levels = returnedLevels(liveItems, setup.points, setup.areas);

  if (!routeEligible) {
    return (
      <OperationsPage subtitle={t.mapsSubtitle} title={t.mapsTitle}>
        <div className={`${styles.card} ${styles.state}`}>{t.exactLocation}</div>
      </OperationsPage>
    );
  }

  const observed = live.data && location.timezone
    ? formatOperationsTime(live.data.observedAt, location.timezone, locale)
    : live.data ? t.timeUnavailable : null;
  const refresh = setupMode ? setup.reload : async () => live.refresh();
  const refreshing = setupMode ? setup.loading : live.loading;

  return (
    <OperationsPage compact help={<ScopedContextHelp helpKey="maps.page" />} referenceHeader subtitle={t.mapsSubtitle} subtitleMargin="half" title={t.mapsTitle}>
      <div className={reference.controlStrip} data-testid="map-reference-toolbar">
        <div className={reference.controlGroup}>
          <div className={reference.scopeControl} title={location.name}>
            <MapPin aria-hidden="true" size={15} />
            <span>{location.name || t.exactLocationLabel}</span>
          </div>
          <div aria-disabled="true" className={reference.levelControl} title={levels.join(", ")}>
            {t.returnedLevels}: {levels.length > 0 ? levels.join(", ") : t.levelUnavailable}
          </div>
          <div aria-label={t.mapsTitle} className={reference.modeGroup}>
            <button
              aria-pressed={!setupMode}
              className={`${reference.modeButton} ${!setupMode ? reference.modeButtonActive : ""}`}
              disabled={setupForced}
              onClick={() => setMode("LIVE")}
              type="button"
            >
              {t.liveMode}
            </button>
            {locationManager ? (
              <button
                aria-pressed={setupMode}
                className={`${reference.modeButton} ${setupMode ? reference.modeButtonActive : ""}`}
                onClick={() => setMode("SETUP")}
                type="button"
              >
                {t.setupMode}
              </button>
            ) : null}
          </div>
        </div>
        <span className={reference.modeHelpAnchor}>
          <ScopedContextHelp helpKey="maps.mode" />
        </span>
        <button
          className={reference.refreshButton}
          disabled={refreshing || (!setupMode && !liveEnabled)}
          onClick={() => void refresh()}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={14} /> {t.refresh}
        </button>
      </div>

      <div className={reference.grid} data-testid="map-reference-grid">
        <div className={reference.mapColumn}>
          {locationManager && subscription.loading ? <div className={styles.setupStatus}>{t.loading}</div> : null}
          {locationManager && subscription.error ? <div className={styles.error} role="alert">{subscription.error.message}</div> : null}
          {locationManager && !subscription.loading && !subscription.error && !lmDashboardAccess ? (
            <div className={styles.setupStatus} data-testid="lm-live-map-unavailable">{t.liveMapUnavailable}</div>
          ) : null}
          {!setupMode && liveError ? <div className={styles.error} role="alert">{liveError}</div> : null}
          {!setupMode && live.loading ? <div className={styles.setupStatus}>{t.loading}</div> : null}
          <section className={reference.surface} aria-label={t.providerNeutralMap}>
            <div className={reference.surfaceBar}>
              <div className={reference.statusRow}>
                {liveItems.some((item) => item.position?.freshness === "LIVE") && !setupMode ? (
                  <span className={reference.statusDot} aria-hidden="true" />
                ) : !setupMode && liveItems.some((item) => item.position?.freshness === "STALE") ? (
                  <span className={`${reference.statusDot} ${reference.statusDotStale}`} aria-hidden="true" />
                ) : null}
                <strong>{setupMode ? t.setupMode : t.liveMode}</strong>
                {observed && !setupMode ? <span>{t.observedAt}: {observed}</span> : null}
              </div>
              <div className={reference.surfaceMeta}>
                <strong>{location.name}</strong>
                <span>{t.providerNeutralMap}</span>
              </div>
            </div>
            <OperationalGoogleMap
              areas={locationManager ? setup.areas : []}
              cameraKey={`${scopeKey}:maps:${setupMode ? "setup" : "live"}:${setupMode ? "setup" : page.cursor ?? "first"}`}
              items={setupMode ? [] : liveItems}
              loading={
                setupMode
                  ? setup.loading
                  : (locationManager && (subscription.loading || setup.loading)) || live.loading
              }
              locale={locale}
              points={locationManager ? setup.points : []}
              theme={theme}
              timezone={location.timezone}
            />
            <div className={reference.surfaceLegend} aria-label={t.providerNeutralMap}>
              <span className={reference.legendItem}>
                <span aria-hidden="true" className={reference.legendLive} />
                {t.liveLegend}
              </span>
              <span className={reference.legendItem}>
                <span aria-hidden="true" className={reference.legendStale} />
                {t.staleLegend}
              </span>
              {locationManager ? (
                <span className={reference.legendItem}>
                  <span aria-hidden="true" className={reference.legendInactive} />
                  {t.inactiveLegend}
                </span>
              ) : null}
              {liveEnabled && !setupMode ? <ScopedContextHelp helpKey="maps.legend" /> : null}
            </div>
          </section>
          {!setupMode && liveEnabled && !live.loading && !live.error && liveItems.length === 0 ? (
            <div className={styles.contextBand}>{t.noTrackedTasks}</div>
          ) : null}
        </div>

        {locationManager ? (
          <>
            <MapSetupPanel
              help={setupMode ? <ScopedContextHelp helpKey="maps.setup" /> : undefined}
              api={dashboard.api}
              areas={setup.areas}
              error={setup.error}
              hidden={!setupMode}
              loading={setup.loading}
              locationId={locationId}
              points={setup.points}
              reload={setup.reload}
              scopeKey={scopeKey}
            />
            <LiveMapPanel
              help={liveEnabled && !setupMode ? <ScopedContextHelp helpKey="maps.live" /> : undefined}
              canNext={Boolean(live.data?.nextCursor)}
              canPrevious={page.canPrevious}
              hidden={setupMode}
              items={liveItems}
              onNext={() => page.next(live.data?.nextCursor ?? null)}
              onPrevious={page.previous}
              timezone={location.timezone}
            />
          </>
        ) : (
          <LiveMapPanel
            help={liveEnabled ? <ScopedContextHelp helpKey="maps.live" /> : undefined}
            canNext={Boolean(live.data?.nextCursor)}
            canPrevious={page.canPrevious}
            hidden={false}
            items={liveItems}
            onNext={() => page.next(live.data?.nextCursor ?? null)}
            onPrevious={page.previous}
            timezone={location.timezone}
          />
        )}
      </div>
    </OperationsPage>
  );
}

function selectedMapLocation(scope: SelectedDashboardScope): {
  readonly name: string;
  readonly timezone: string | undefined;
} {
  if (scope.authority === "COMPANY_ADMIN") {
    return {
      name: scope.context.selectedLocation?.name ?? "",
      timezone: scope.context.selectedLocation?.timezone,
    };
  }
  if (scope.authority === "LOCATION_MANAGER") {
    return { name: scope.location.name, timezone: scope.location.timezone };
  }
  if (scope.authority === "SUPERVISOR") {
    return { name: scope.context.location.name, timezone: scope.context.location.timezone };
  }
  return { name: "", timezone: undefined };
}

function returnedLevels(
  items: readonly LiveMapItem[],
  points: readonly { readonly levelLabel: string | null }[],
  areas: readonly { readonly levelLabel: string | null }[],
): readonly string[] {
  const values = [
    ...points.map((point) => point.levelLabel),
    ...areas.map((area) => area.levelLabel),
    ...items.flatMap((item) => item.position?.areas.map((area) => area.levelLabel) ?? []),
  ].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim());
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function liveErrorMessage(error: Error, denied: string) {
  if (error instanceof DashboardApiError && (
    error.kind === "authorization" || error.kind === "entitlement"
  )) return denied;
  return error.message;
}
