"use client";

import { Building, MapPin, Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage, isMfaRequired } from "../administration-error";
import { administrationScope, administrationScopeKey } from "../administration-scope";
import { AdministrationPage, ReadState, StatusBadge, styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useAuthoritativeRead } from "../use-authoritative-read";
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
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const locationStatusLabel = (status: "ACTIVE" | "INACTIVE") => status === "ACTIVE" ? t.active : t.inactive;
  const companyAdmin = scope.authority === "COMPANY_ADMIN";
  const locationManager = scope.authority === "LOCATION_MANAGER";
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(scope.locationId);
  const [createOpen, setCreateOpen] = useState(false);
  const [lifecycleMfaDismissed, setLifecycleMfaDismissed] = useState(false);
  const loadLocations = useCallback((signal: AbortSignal) => readLocations(dashboard.api, scope.organizationId, cursor, signal), [dashboard.api, scope.organizationId, cursor]);
  const locations = useAuthoritativeRead(`${scopeKey}:locations:${cursor ?? "first"}`, loadLocations, companyAdmin);
  const loadLifecycle = useCallback((signal: AbortSignal) => {
    if (!selectedId) throw new Error("Location lifecycle requires an exact Location.");
    return readLocationLifecycle(dashboard.api, scope.organizationId, selectedId, signal);
  }, [dashboard.api, scope.organizationId, selectedId]);
  const lifecycle = useAuthoritativeRead(`${scopeKey}:lifecycle:${selectedId ?? "none"}`, loadLifecycle, companyAdmin && selectedId !== null);
  const lifecycleNeedsMfa = isMfaRequired(lifecycle.error);

  if (!companyAdmin && !locationManager) return null;
  const lmLocation = dashboard.selectedScope.authority === "LOCATION_MANAGER" ? dashboard.selectedScope.location : null;
  return (
    <AdministrationPage action={companyAdmin ? <button className={styles.primary} onClick={() => setCreateOpen(true)} type="button"><Plus size={15} /> {t.addLocation}</button> : undefined} subtitle={t.locationsSubtitle} title={t.locationsTitle}>
      {locationManager && lmLocation ? (
        <div className={styles.masterDetail}><div className={styles.card}><div className={styles.listHeader}><Building size={16} /> {t.allLocations}</div><div className={styles.list}><div className={`${styles.listItem} ${styles.listItemActive}`}><MapPin size={18} /><div><div className={styles.strong}>{lmLocation.name}</div><div className={styles.muted}>{lmLocation.code}</div></div></div></div></div><div className={styles.card}><div className={styles.facilityHero}><MapPin aria-hidden="true" /></div><div className={styles.detailBody}><div className={styles.detailHeading}><div><h2 className={styles.title}>{lmLocation.name}</h2><p className={styles.subtitle}><bdi dir="ltr">{lmLocation.code}</bdi></p></div><StatusBadge good={lmLocation.status === "ACTIVE"}>{locationStatusLabel(lmLocation.status)}</StatusBadge></div><div className={styles.facts}><div className={styles.fact}><div className={styles.factValue}><bdi dir="ltr">{lmLocation.code}</bdi></div><div className={styles.factLabel}>{t.code}</div></div><div className={styles.fact}><div className={styles.factValue}><bdi dir="ltr">{lmLocation.timezone}</bdi></div><div className={styles.factLabel}>{t.timezone}</div></div><div className={styles.fact}><div className={styles.factValue}><bdi dir="ltr">{lmLocation.currency}</bdi></div><div className={styles.factLabel}>{t.currency}</div></div></div></div></div></div>
      ) : null}
      {companyAdmin ? <ReadState error={locations.error ? new Error(administrationErrorMessage(locations.error)) : null} loading={locations.loading} onRetry={locations.refresh}>
        <div className={styles.masterDetail}>
          <div className={styles.card}><div className={styles.listHeader}><Building size={16} /> {t.allLocations}</div><div className={styles.list}>{locations.data?.items.map((location) => <button className={`${styles.listItem} ${selectedId === location.locationId ? styles.listItemActive : ""}`} key={location.locationId} onClick={() => { setSelectedId(location.locationId); setLifecycleMfaDismissed(false); }} type="button"><MapPin size={18} /><div><div className={styles.strong}>{location.name}</div><div className={styles.muted}><bdi dir="ltr">{location.code}</bdi> · {locationStatusLabel(location.status)}</div></div></button>)}</div><div className={styles.pagination}><button className={styles.secondary} disabled={history.length === 0} onClick={() => { const next = [...history]; setCursor(next.pop() ?? null); setHistory(next); }} type="button">{t.previous}</button><button className={styles.secondary} disabled={!locations.data?.nextCursor} onClick={() => { setHistory((items) => [...items, cursor]); setCursor(locations.data?.nextCursor ?? null); }} type="button">{t.next}</button></div></div>
          <div className={styles.card}>{selectedId ? <ReadState error={lifecycle.error && (!lifecycleNeedsMfa || lifecycleMfaDismissed) ? new Error(administrationErrorMessage(lifecycle.error)) : null} loading={lifecycle.loading} onRetry={lifecycle.refresh}>{lifecycle.data ? <><div className={styles.facilityHero}><MapPin aria-hidden="true" /></div><div className={styles.detailBody}><div className={styles.detailHeading}><div><h2 className={styles.title}>{lifecycle.data.name}</h2><p className={styles.subtitle}><MapPin size={14} /> {lifecycle.data.addressText}</p></div><StatusBadge good={lifecycle.data.status === "ACTIVE"}>{locationStatusLabel(lifecycle.data.status)}</StatusBadge></div><LocationLifecyclePanel api={dashboard.api} location={lifecycle.data} onReload={() => { lifecycle.refresh(); locations.refresh(); }} organizationId={scope.organizationId} /></div></> : lifecycleNeedsMfa ? <div className={styles.empty}>{t.mfaRetry}</div> : null}</ReadState> : <div className={styles.empty}>{t.selectLocation}</div>}</div>
        </div>
      </ReadState> : null}
      {createOpen ? <LocationCreateDialog api={dashboard.api} onClose={() => setCreateOpen(false)} onCreated={(locationId) => { setCreateOpen(false); setSelectedId(locationId); locations.refresh(); }} organizationId={scope.organizationId} /> : null}
      {lifecycleNeedsMfa && !lifecycleMfaDismissed ? <SensitiveMfaDialog api={dashboard.api} onAssured={() => { setLifecycleMfaDismissed(false); lifecycle.refresh(); }} onClose={() => setLifecycleMfaDismissed(true)} /> : null}
    </AdministrationPage>
  );
}
