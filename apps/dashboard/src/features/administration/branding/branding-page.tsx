"use client";

import { Palette } from "lucide-react";
import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { ReferenceAdministrationPage as AdministrationPage } from "../reference-administration-page";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import {
  administrationScope,
  administrationScopeKey,
} from "../administration-scope";
import { ReadState, styles } from "../administration-ui";
import { AdministrationTabs } from "../administration-tabs";
import { useAuthoritativeRead } from "../use-authoritative-read";
import {
  CompanyBrandingEditor,
  LocationManagerBrandingEditor,
  ManagementLocationBrandingEditor,
} from "./branding-editors";
import {
  readCompanyBranding,
  readLocationManagerBranding,
  readManagementLocationBranding,
} from "./branding-api";

export function BrandingPage() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const companyAdmin = scope.authority === "COMPANY_ADMIN";
  const locationManager = scope.authority === "LOCATION_MANAGER";
  const [tab, setTab] = useState<"company" | "location">(
    companyAdmin ? "company" : "location",
  );
  const activeTab = companyAdmin ? tab : "location";
  const loadCompany = useCallback(
    (signal: AbortSignal) =>
      readCompanyBranding(dashboard.api, scope.organizationId, signal),
    [dashboard.api, scope.organizationId],
  );
  const company = useAuthoritativeRead(
    `${scopeKey}:company-branding`,
    loadCompany,
    companyAdmin && activeTab === "company",
  );
  const loadLocation = useCallback(
    (signal: AbortSignal) => {
      if (!scope.locationId)
        return Promise.reject(new Error(t.exactLocationRequired));
      return readManagementLocationBranding(
        dashboard.api,
        scope.organizationId,
        scope.locationId,
        signal,
      );
    },
    [
      dashboard.api,
      scope.locationId,
      scope.organizationId,
      t.exactLocationRequired,
    ],
  );
  const location = useAuthoritativeRead(
    `${scopeKey}:location-branding`,
    loadLocation,
    companyAdmin && activeTab === "location" && scope.locationId !== null,
  );
  const loadLm = useCallback(
    (signal: AbortSignal) => {
      if (!scope.locationId)
        return Promise.reject(new Error(t.exactLocationRequired));
      return readLocationManagerBranding(
        dashboard.api,
        scope.locationId,
        signal,
      );
    },
    [dashboard.api, scope.locationId, t.exactLocationRequired],
  );
  const lm = useAuthoritativeRead(
    `${scopeKey}:lm-branding`,
    loadLm,
    locationManager && scope.locationId !== null,
  );
  if (!companyAdmin && !locationManager) return null;
  return (
    <AdministrationPage
      helpInGap
      action={<ScopedContextHelp helpKey="branding.page" />}
      icon={Palette}
      subtitle={t.brandingSubtitle}
      title={t.brandingTitle}
    >
      {companyAdmin ? (
        <AdministrationTabs
          active={activeTab}
          id="branding"
          label={t.brandingTitle}
          items={[
            { value: "company", label: t.companyBranding },
            { value: "location", label: t.locationBranding },
          ]}
          onSelect={setTab}
        />
      ) : null}
      <div
        role={companyAdmin ? "tabpanel" : undefined}
        aria-labelledby={companyAdmin ? `branding-tab-${activeTab}` : undefined}
        id={`branding-panel-${activeTab}`}
      >
        {companyAdmin && activeTab === "company" ? (
          <ReadState
            error={
              company.error
                ? new Error(administrationErrorMessage(company.error))
                : null
            }
            loading={company.loading}
            onRetry={company.refresh}
          >
            {company.data ? (
              <CompanyBrandingEditor
                api={dashboard.api}
                data={company.data}
                key={company.data.updatedAt}
                onReload={company.refresh}
              />
            ) : null}
          </ReadState>
        ) : null}
        {companyAdmin && activeTab === "location" ? (
          scope.locationId === null ? (
            <div className={`${styles.card} ${styles.empty}`}>
              {t.exactLocationRequired}
            </div>
          ) : (
            <ReadState
              error={
                location.error
                  ? new Error(administrationErrorMessage(location.error))
                  : null
              }
              loading={location.loading}
              onRetry={location.refresh}
            >
              {location.data ? (
                <ManagementLocationBrandingEditor
                  api={dashboard.api}
                  data={location.data}
                  key={location.data.updatedAt}
                  onReload={location.refresh}
                />
              ) : null}
            </ReadState>
          )
        ) : null}
        {locationManager ? (
          <ReadState
            error={
              lm.error ? new Error(administrationErrorMessage(lm.error)) : null
            }
            loading={lm.loading}
            onRetry={lm.refresh}
          >
            {lm.data ? (
              <LocationManagerBrandingEditor
                api={dashboard.api}
                data={lm.data}
                key={lm.data.updatedAt}
                onReload={lm.refresh}
              />
            ) : null}
          </ReadState>
        ) : null}
      </div>
    </AdministrationPage>
  );
}
