"use client";

import { Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import {
  administrationErrorMessage,
  isMfaRequired,
} from "../administration-error";
import {
  administrationScope,
  administrationScopeKey,
} from "../administration-scope";
import { AdministrationPage, ReadState, styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { PhysicalResourcesPanel } from "../physical-resources/physical-resources-panel";
import { LocationMaster } from "./location-master";
import { LocationDetail } from "./location-detail";
import reference from "./locations-reference.module.css";
import { LocationCreateDialog } from "./location-create-dialog";
import { LocationLifecyclePanel } from "./location-lifecycle-panel";
import { readLocationLifecycle, readLocations } from "./locations-api";

export function LocationsPage() {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard);
  return <LocationsPageContent key={scopeKey} />;
}

function LocationsPageContent() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const { locale, t: translate } = useDashboardLocale();
  const t = administrationCopy(locale);
  const companyAdmin = scope.authority === "COMPANY_ADMIN";
  const locationManager = scope.authority === "LOCATION_MANAGER";
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(scope.locationId);
  const [createOpen, setCreateOpen] = useState(false);
  const [lifecycleMfaDismissed, setLifecycleMfaDismissed] = useState(false);
  const loadLocations = useCallback(
    (signal: AbortSignal) =>
      readLocations(dashboard.api, scope.organizationId, cursor, signal),
    [dashboard.api, scope.organizationId, cursor],
  );
  const locations = useAuthoritativeRead(
    `${scopeKey}:locations:${cursor ?? "first"}`,
    loadLocations,
    companyAdmin,
  );
  const loadLifecycle = useCallback(
    (signal: AbortSignal) => {
      if (!selectedId)
        throw new Error("Location lifecycle requires an exact Location.");
      return readLocationLifecycle(
        dashboard.api,
        scope.organizationId,
        selectedId,
        signal,
      );
    },
    [dashboard.api, scope.organizationId, selectedId],
  );
  const lifecycle = useAuthoritativeRead(
    `${scopeKey}:lifecycle:${selectedId ?? "none"}`,
    loadLifecycle,
    companyAdmin && selectedId !== null,
  );
  const lifecycleNeedsMfa = isMfaRequired(lifecycle.error);

  if (!companyAdmin && !locationManager) return null;
  const lmLocation =
    dashboard.selectedScope.authority === "LOCATION_MANAGER"
      ? dashboard.selectedScope.location
      : null;
  const selectedScopeLocation =
    dashboard.selectedScope.authority === "COMPANY_ADMIN"
      ? dashboard.selectedScope.context.selectedLocation
      : null;
  const selectedListLocation =
    locations.data?.items.find((item) => item.locationId === selectedId) ?? null;
  const selectedLocation =
    lifecycle.data ??
    selectedListLocation ??
    (selectedScopeLocation?.locationId === selectedId ? selectedScopeLocation : null);
  function select(id: string) {
    setSelectedId(id);
    setLifecycleMfaDismissed(false);
  }

  return (
    <div className={reference.page}>
      <AdministrationPage
        action={
          companyAdmin ? (
            <button
              className={reference.add}
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              {t.addLocation}
            </button>
          ) : undefined
        }
        subtitle={t.locationsSubtitle}
        subtitleSize="sm"
        title={t.locationsTitle}
        titleTracking="tight"
      >
        {locationManager && lmLocation ? (
          <div className={reference.grid}>
            <LocationMaster
              items={[lmLocation]}
              selectedId={lmLocation.locationId}
            />
            <section
              className={`${styles.card} ${reference.detail}`}
              data-testid="location-detail"
            >
              <LocationDetail location={lmLocation}>
                <PhysicalResourcesPanel
                  api={dashboard.api}
                  identityGeneration={dashboard.identityGeneration}
                  location={lmLocation}
                  scopeKey={scopeKey}
                />
              </LocationDetail>
            </section>
          </div>
        ) : null}
        {companyAdmin ? (
          <ReadState
            error={
              locations.error
                ? new Error(administrationErrorMessage(locations.error))
                : null
            }
            loading={locations.loading && !locations.data}
            onRetry={locations.refresh}
          >
            <div className={reference.grid}>
              <LocationMaster
                items={locations.data?.items ?? []}
                onSelect={select}
                selectedId={selectedId}
                pagination={{
                  hasPrevious: !locations.loading && history.length > 0,
                  hasNext:
                    !locations.loading && Boolean(locations.data?.nextCursor),
                  previous: () => {
                    const next = [...history];
                    setCursor(next.pop() ?? null);
                    setHistory(next);
                  },
                  next: () => {
                    setHistory((items) => [...items, cursor]);
                    setCursor(locations.data?.nextCursor ?? null);
                  },
                }}
              />
              <section
                className={`${styles.card} ${reference.detail}`}
                data-testid="location-detail"
              >
                {selectedId ? (
                  selectedLocation ? (
                    <LocationDetail
                      {...(lifecycle.data?.addressText === undefined
                        ? {}
                        : { addressText: lifecycle.data.addressText })}
                      location={selectedLocation}
                    >
                      <PhysicalResourcesPanel
                        api={dashboard.api}
                        identityGeneration={dashboard.identityGeneration}
                        key={`physical-${selectedLocation.locationId}`}
                        location={selectedLocation}
                        scopeKey={scopeKey}
                      />
                      <ReadState
                        error={
                          lifecycle.error &&
                          (!lifecycleNeedsMfa || lifecycleMfaDismissed)
                            ? new Error(administrationErrorMessage(lifecycle.error))
                            : null
                        }
                        loading={lifecycle.loading && !lifecycle.data && !lifecycleNeedsMfa}
                        onRetry={lifecycle.refresh}
                      >
                        {lifecycle.data ? (
                          <LocationLifecyclePanel
                            api={dashboard.api}
                            key={lifecycle.data.locationId}
                            location={lifecycle.data}
                            organizationId={scope.organizationId}
                            refreshing={lifecycle.loading}
                            onReload={() => {
                              lifecycle.refresh();
                              locations.refresh();
                            }}
                          />
                        ) : lifecycleNeedsMfa ? (
                          <div className={styles.empty}>
                            {translate("mfaStatusStepUpRequired")}
                          </div>
                        ) : null}
                      </ReadState>
                    </LocationDetail>
                  ) : (
                    <div className={styles.empty}>{t.selectLocation}</div>
                  )
                ) : (
                  <div className={styles.empty}>{t.selectLocation}</div>
                )}
              </section>
            </div>
          </ReadState>
        ) : null}
        {createOpen ? (
          <LocationCreateDialog
            api={dashboard.api}
            onClose={() => setCreateOpen(false)}
            organizationId={scope.organizationId}
            onCreated={(locationId) => {
              setCreateOpen(false);
              select(locationId);
              locations.refresh();
            }}
          />
        ) : null}
        {lifecycleNeedsMfa && !lifecycleMfaDismissed ? (
          <SensitiveMfaDialog
            api={dashboard.api}
            onAssured={() => {
              setLifecycleMfaDismissed(false);
              lifecycle.refresh();
            }}
            onClose={() => setLifecycleMfaDismissed(true)}
          />
        ) : null}
      </AdministrationPage>
    </div>
  );
}
