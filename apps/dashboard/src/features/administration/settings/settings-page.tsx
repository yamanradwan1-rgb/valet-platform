"use client";

import { useCallback, useState, type ReactNode } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import { administrationScope, administrationScopeKey } from "../administration-scope";
import { AdministrationPage, styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { CompanySettingsPanel } from "./company-settings-panel";
import { LocationManagerSettingsPanel } from "./location-manager-settings-panel";
import { ManagementLocationSettingsPanel } from "./management-location-settings-panel";
import { settingsTableCopy } from "./settings-copy";
import {
  readCompanySettings,
  readLocationManagerSettings,
  readManagementLocationSettings,
} from "./settings-api";

function SettingsReadState(props: {
  readonly children: ReactNode;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly onRetry: () => void;
  readonly retryLabel: string;
  readonly loadingLabel: string;
}) {
  if (props.loading) return <div className={styles.empty}>{props.loadingLabel}</div>;
  if (props.error) return <div className={styles.cardPad}><div className={styles.error} role="alert"><div>{props.error.message}</div><button className={styles.secondary} onClick={props.onRetry} type="button">{props.retryLabel}</button></div></div>;
  return <>{props.children}</>;
}

export function SettingsPage() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const copy = settingsTableCopy(locale);
  const companyAdmin = scope.authority === "COMPANY_ADMIN";
  const locationManager = scope.authority === "LOCATION_MANAGER";
  const [tab, setTab] = useState<"company" | "location">(companyAdmin ? "company" : "location");
  const activeTab = companyAdmin ? tab : "location";

  const loadCompany = useCallback((signal: AbortSignal) =>
    readCompanySettings(dashboard.api, scope.organizationId, signal),
  [dashboard.api, scope.organizationId]);
  const company = useAuthoritativeRead(`${scopeKey}:company-settings`, loadCompany, companyAdmin && activeTab === "company");
  const loadManagementLocation = useCallback((signal: AbortSignal) => {
    if (!scope.locationId) return Promise.reject(new Error(t.selectLocation));
    return readManagementLocationSettings(dashboard.api, scope.organizationId, scope.locationId, signal);
  }, [dashboard.api, scope.locationId, scope.organizationId, t.selectLocation]);
  const managementLocation = useAuthoritativeRead(`${scopeKey}:management-location-settings`, loadManagementLocation,
    companyAdmin && activeTab === "location" && scope.locationId !== null);
  const loadLm = useCallback((signal: AbortSignal) => {
    if (!scope.locationId) return Promise.reject(new Error(t.selectLocation));
    return readLocationManagerSettings(dashboard.api, scope.locationId, signal);
  }, [dashboard.api, scope.locationId, t.selectLocation]);
  const lm = useAuthoritativeRead(`${scopeKey}:lm-settings`, loadLm, locationManager && scope.locationId !== null);

  if (!companyAdmin && !locationManager) return null;
  return (
    <AdministrationPage subtitle={t.policiesSubtitle} subtitleMargin="half" subtitleSize="sm" title={t.policiesTitle}>
      <div className={styles.card}>
        {companyAdmin ? <div aria-label={copy.tabsLabel} className={`${styles.tabs} ${styles.tabsInset} ${styles.referenceTabs}`} role="tablist">
          <button aria-controls="settings-panel-company" aria-selected={activeTab === "company"} className={`${styles.tab} ${styles.referenceTab} ${activeTab === "company" ? `${styles.tabActive} ${styles.referenceTabActive}` : ""}`} id="settings-tab-company" onClick={() => setTab("company")} role="tab" type="button">{t.companyDefaults}</button>
          <button aria-controls="settings-panel-location" aria-selected={activeTab === "location"} className={`${styles.tab} ${styles.referenceTab} ${activeTab === "location" ? `${styles.tabActive} ${styles.referenceTabActive}` : ""}`} id="settings-tab-location" onClick={() => setTab("location")} role="tab" type="button">{t.locationOverrides}</button>
        </div> : null}
        {companyAdmin && activeTab === "company" ? <div aria-labelledby="settings-tab-company" id="settings-panel-company" role="tabpanel"><SettingsReadState error={company.error ? new Error(administrationErrorMessage(company.error)) : null} loading={company.loading} loadingLabel={t.loading} onRetry={company.refresh} retryLabel={t.retry}>{company.data ? <CompanySettingsPanel api={dashboard.api} data={company.data} key={company.data.updatedAt} locale={locale} onReload={company.refresh} /> : null}</SettingsReadState></div> : null}
        {companyAdmin && activeTab === "location" ? <div aria-labelledby="settings-tab-location" id="settings-panel-location" role="tabpanel">{scope.locationId === null ? <div className={styles.empty}>{t.selectLocation}</div> : <SettingsReadState error={managementLocation.error ? new Error(administrationErrorMessage(managementLocation.error)) : null} loading={managementLocation.loading} loadingLabel={t.loading} onRetry={managementLocation.refresh} retryLabel={t.retry}>{managementLocation.data ? <ManagementLocationSettingsPanel api={dashboard.api} data={managementLocation.data} key={managementLocation.data.updatedAt} locale={locale} onReload={managementLocation.refresh} /> : null}</SettingsReadState>}</div> : null}
        {locationManager ? <SettingsReadState error={lm.error ? new Error(administrationErrorMessage(lm.error)) : null} loading={lm.loading} loadingLabel={t.loading} onRetry={lm.refresh} retryLabel={t.retry}>{lm.data ? <LocationManagerSettingsPanel api={dashboard.api} data={lm.data} key={lm.data.updatedAt} locale={locale} onReload={lm.refresh} /> : null}</SettingsReadState> : null}
      </div>
    </AdministrationPage>
  );
}
