"use client";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import {
  readCompanyAnalytics,
  readLocationIncidentAnalytics,
  readLocationKpiAnalytics,
  readLocationOperationalAnalytics,
} from "./intelligence-api";
import { DashboardPeriodControl } from "./dashboard-period-control";
import { intelligenceScope } from "./intelligence-scope";
import { OverviewActivityChart } from "./overview-activity-chart";
import { overviewCopy } from "./overview-copy";
import { OverviewMetrics } from "./overview-metrics";
import {
  OverviewCurrentPanel,
  OverviewLocationCurrentRead,
} from "./overview-current-panel";
import { OverviewPanelState } from "./overview-page-ui";
import {
  companyOverviewPresentation,
  locationOverviewPresentation,
} from "./overview-presentation";
import styles from "./overview.module.css";
import { useIntelligenceRead } from "./use-intelligence-read";
import { useDashboardPeriod } from "./use-dashboard-period";

export function OverviewPage() {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = overviewCopy(locale);
  const scope = intelligenceScope(dashboard.selectedScope);
  const periodState = useDashboardPeriod();
  const { period, validation } = periodState;
  const descriptorPeriod = period ?? { from: "", to: "" };

  const company = useIntelligenceRead({
    descriptor: { endpointFamily: "COMPANY_ANALYTICS", ...descriptorPeriod },
    enabled: scope?.kind === "COMPANY" && period !== null,
    preserveOnRetry: true,
    load: ({ api, scope: readScope, signal }) => {
      if (readScope.kind !== "COMPANY" || !period) throw new Error("Company period read mismatch");
      return readCompanyAnalytics(api, readScope.organizationId, period, signal);
    },
  });
  const operations = useIntelligenceRead({
    descriptor: { endpointFamily: "LOCATION_OPERATIONS", ...descriptorPeriod },
    enabled: scope?.kind === "LOCATION" && period !== null,
    load: ({ api, scope: readScope, signal }) => {
      if (readScope.kind !== "LOCATION" || !period) throw new Error("Location period read mismatch");
      return readLocationOperationalAnalytics(api, readScope.locationId, period, signal);
    },
  });
  const incidents = useIntelligenceRead({
    descriptor: { endpointFamily: "LOCATION_INCIDENTS", ...descriptorPeriod },
    enabled: scope?.kind === "LOCATION" && period !== null,
    load: ({ api, scope: readScope, signal }) => {
      if (readScope.kind !== "LOCATION" || !period) throw new Error("Location incident read mismatch");
      return readLocationIncidentAnalytics(api, readScope.locationId, period, signal);
    },
  });
  const kpis = useIntelligenceRead({
    descriptor: { endpointFamily: "LOCATION_KPIS", ...descriptorPeriod },
    enabled: scope?.kind === "LOCATION" && period !== null,
    load: ({ api, scope: readScope, signal }) => {
      if (readScope.kind !== "LOCATION" || !period) throw new Error("Location KPI read mismatch");
      return readLocationKpiAnalytics(api, readScope.locationId, period, signal);
    },
  });

  if (!scope) return null;
  const scopeKind = scope.kind;
  const presentation = scope.kind === "COMPANY"
    ? (company.data ? companyOverviewPresentation(company.data) : null)
    : (operations.data && incidents.data && kpis.data
      ? locationOverviewPresentation(operations.data, incidents.data, kpis.data)
      : null);
  const periodLoading = scope.kind === "COMPANY"
    ? company.loading
    : operations.loading || incidents.loading || kpis.loading;
  const periodReadError = scope.kind === "COMPANY"
    ? company.error
    : operations.error ?? incidents.error ?? kpis.error;
  const currentGenerationKey = period
    ? `${period.from}:${period.to}`
    : "no-period";

  function retryPeriod() {
    if (scopeKind === "COMPANY") company.retry();
    else {
      operations.retry();
      incidents.retry();
      kpis.retry();
    }
  }

  return (
    <div className={styles.page} data-testid="md05-overview-page">
      <div className={styles.header}>
        <h1>{t.title}</h1>
        <p>{scope.kind === "COMPANY" ? t.companySubtitle : t.locationSubtitle}</p>
        <DashboardPeriodControl onRefresh={retryPeriod} refreshing={periodLoading && Boolean(presentation)} scopeKind={scope.kind} state={periodState} />
      </div>
      <OverviewMetrics
        error={periodReadError}
        loading={periodLoading && !presentation}
        locale={locale}
        presentation={presentation}
        validation={validation}
      />
      <div className={styles.lowerGrid}>
        <section className={[styles.panel, styles.activityPanel].join(" ")}>
          <div className={styles.panelHeader}>
            <h2>{t.activity}</h2>
          </div>
          {!period ? (
            <OverviewPanelState message={validation.kind === "required" ? t.periodRequired : t.invalidPeriod} />
          ) : periodLoading && !presentation ? (
            <OverviewPanelState message={t.loading} />
          ) : periodReadError ? (
            <OverviewPanelState
              message={errorMessage(periodReadError, t)}
              onRetry={retryPeriod}
              retry={t.retry}
            />
          ) : (
            <OverviewActivityChart data={presentation?.activity ?? []} locale={locale} />
          )}
        </section>
        {scope.kind === "LOCATION" ? (
          <OverviewLocationCurrentRead
            errorMessage={(error) => errorMessage(error, t)}
            key={currentGenerationKey}
            locale={locale}
          />
        ) : (
          <OverviewCurrentPanel
            companyCoverage={presentation?.companyCoverage ?? null}
            current={null}
            errorMessage={periodReadError ? errorMessage(periodReadError, t) : null}
            loading={periodLoading && !presentation}
            locale={locale}
            mode="COMPANY"
            onRetry={retryPeriod}
            periodSelected={period !== null}
          />
        )}
      </div>
    </div>
  );
}

function errorMessage(error: unknown, t: ReturnType<typeof overviewCopy>) {
  if (!(error instanceof DashboardApiError)) return t.errorGeneric;
  if (error.kind === "auth") return t.errorAuth;
  if (error.kind === "mfa") return t.errorMfa;
  if (error.kind === "authorization") return t.errorAuthorization;
  if (error.kind === "entitlement") return t.errorEntitlement;
  if (error.kind === "validation") return t.errorValidation;
  if (error.kind === "malformed") return t.errorMalformed;
  if (error.kind === "network") return t.errorNetwork;
  return t.errorGeneric;
}
