"use client";

import { ChevronDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { selectedScopePresentation } from "../../components/foundation/scope-presentation";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { BidiText } from "../../components/presentation/panel";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../help/scoped-context-help";
import helpStyles from "./intelligence-help.module.css";
import { AnalyticsActivityChart } from "./analytics-activity-chart";
import { AnalyticsCoverage } from "./analytics-coverage";
import { AnalyticsCards } from "./analytics-cards";
import {
  analyticsCopy,
  analyticsPeriodMessage,
} from "./analytics-copy";
import {
  companyAnalyticsPresentation,
  locationAnalyticsPresentation,
} from "./analytics-presentation";
import { DashboardPeriodControl } from "./dashboard-period-control";
import { AnalyticsSecondaryChart } from "./analytics-secondary-chart";
import {
  readCompanyAnalytics,
  readLocationFinancialAnalytics,
  readLocationIncidentAnalytics,
  readLocationKpiAnalytics,
  readLocationOperationalAnalytics,
} from "./intelligence-api";
import { intelligenceScope } from "./intelligence-scope";
import { useDashboardPeriod } from "./use-dashboard-period";
import { useIntelligenceRead } from "./use-intelligence-read";
import styles from "./analytics.module.css";

const retryButtonStyle: CSSProperties = {
  padding: "0.375rem 0.625rem",
  border: "1px solid var(--analytics-control-border)",
  borderRadius: "0.5rem",
  background: "var(--analytics-control-bg)",
  color: "var(--analytics-control-text)",
  cursor: "pointer",
  fontSize: "0.75rem",
  fontWeight: 600,
};

export function AnalyticsPage() {
  const dashboard = useProtectedDashboard();
  const { clearScope } = useSelectedScope();
  const { locale, t: uiCopy } = useDashboardLocale();
  const t = analyticsCopy(locale);
  const scope = intelligenceScope(dashboard.selectedScope);
  const scopePresentation = selectedScopePresentation(dashboard.selectedScope);
  const periodState = useDashboardPeriod();
  const { period, validation: periodValidation } = periodState;
  const descriptorPeriod = period ?? { from: "", to: "" };

  const company = useIntelligenceRead({
    descriptor: { endpointFamily: "COMPANY_ANALYTICS", ...descriptorPeriod },
    enabled: scope?.kind === "COMPANY" && period !== null,
    preserveOnRetry: true,
    load: ({ api, scope: readScope, signal }) => {
      if (readScope.kind !== "COMPANY" || !period) throw new Error("Company analytics read mismatch");
      return readCompanyAnalytics(api, readScope.organizationId, period, signal);
    },
  });
  const locationEnabled = scope?.kind === "LOCATION";
  const operations = useLocationRead("LOCATION_OPERATIONS", locationEnabled, period, readLocationOperationalAnalytics);
  const financial = useLocationRead("LOCATION_FINANCIAL_ANALYTICS", locationEnabled, period, readLocationFinancialAnalytics);
  const incidents = useLocationRead("LOCATION_INCIDENTS", locationEnabled, period, readLocationIncidentAnalytics);
  const kpis = useLocationRead("LOCATION_KPIS", locationEnabled, period, readLocationKpiAnalytics);

  if (!scope) return null;
  const scopeKind = scope.kind;
  const locationReady = operations.data && financial.data && incidents.data && kpis.data;
  const presentation = scope.kind === "COMPANY"
    ? (company.data ? companyAnalyticsPresentation(company.data) : null)
    : (locationReady
        ? locationAnalyticsPresentation(operations.data!, financial.data!, incidents.data!, kpis.data!)
        : null);
  const loading = scope.kind === "COMPANY"
    ? company.loading
    : operations.loading || financial.loading || incidents.loading || kpis.loading;
  const readError = scope.kind === "COMPANY"
    ? company.error
    : operations.error ?? financial.error ?? incidents.error ?? kpis.error;
  const message = analyticsPeriodMessage(locale, periodValidation, readError, loading && !presentation);
  const scopeLabel = scope.kind === "COMPANY"
    ? uiCopy("allLocations")
    : scopePresentation.location?.label ?? uiCopy("location");

  function retry() {
    if (scopeKind === "COMPANY") company.retry();
    else {
      operations.retry();
      financial.retry();
      incidents.retry();
      kpis.retry();
    }
  }

  return (
    <div className={styles.page} data-testid="md05-analytics-page">
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <div className={helpStyles.headingRow}>
            <h1>{t.title}</h1>
            <ScopedContextHelp helpKey="analytics.page" />
          </div>
          <p>{t.subtitle}</p>
        </div>
        <div className={styles.headerActions} data-testid="analytics-header-selectors">
          <DashboardPeriodControl helpKey="analytics.period" onRefresh={retry} refreshing={loading && Boolean(presentation)} scopeKind={scope.kind} state={periodState} />
          <button
            aria-label={`${uiCopy("changeScope")}: ${scopeLabel}`}
            className={styles.scopeButton}
            onClick={clearScope}
            type="button"
          >
            <span>{scopeLabel}</span>
            <ChevronDown aria-hidden="true" className={styles.scopeChevron} size={16} />
          </button>
        </div>
      </header>

      <AnalyticsCards message={message} presentation={presentation} locale={locale} />

      <div className={styles.charts} data-testid="analytics-chart-grid">
        <ChartPanel helpKey="analytics.activity" title={t.vehicleActivity} period={period}>
          {message ? <ChartState message={message} onRetry={readError ? retry : undefined} retry={t.retry} /> : presentation ? (
            <AnalyticsActivityChart data={presentation.activity} locale={locale} />
          ) : null}
        </ChartPanel>
        <ChartPanel helpKey="analytics.durations" title={t.durationComparison} period={period}>
          {message ? <ChartState message={message} onRetry={readError ? retry : undefined} retry={t.retry} /> : presentation ? (
            <>
              <AnalyticsSecondaryChart data={presentation.durations} locale={locale} />
              <AnalyticsCoverage locale={locale} presentation={presentation} />
            </>
          ) : null}
        </ChartPanel>
      </div>

    </div>
  );
}

function useLocationRead<T>(
  endpointFamily: "LOCATION_OPERATIONS" | "LOCATION_FINANCIAL_ANALYTICS" | "LOCATION_INCIDENTS" | "LOCATION_KPIS",
  enabled: boolean,
  period: { readonly from: string; readonly to: string } | null,
  read: (
    api: DashboardApiClient,
    locationId: string,
    readPeriod: { readonly from: string; readonly to: string },
    signal?: AbortSignal,
  ) => Promise<T>,
) {
  const descriptorPeriod = period ?? { from: "", to: "" };
  return useIntelligenceRead<T>({
    descriptor: { endpointFamily, ...descriptorPeriod },
    enabled: enabled && period !== null,
    load: ({ api, scope, signal }) => {
      if (scope.kind !== "LOCATION" || !period) throw new Error("Location analytics read mismatch");
      return read(api, scope.locationId, period, signal);
    },
  });
}

function ChartPanel(props: {
  readonly children: ReactNode;
  readonly helpKey: "analytics.activity" | "analytics.durations";
  readonly period: { readonly from: string; readonly to: string } | null;
  readonly title: string;
}) {
  return (
    <section className={styles.chartPanel} data-testid="analytics-chart-panel">
      <div className={styles.chartHeader}>
        <h2>{props.title}</h2>
        {props.period ? <BidiText kind="number">{props.period.from} – {props.period.to}</BidiText> : null}
      </div>
      <span className={styles.chartHelpAnchor}>
        <ScopedContextHelp helpKey={props.helpKey} />
      </span>
      {props.children}
    </section>
  );
}

function ChartState(props: {
  readonly message: string;
  readonly onRetry?: (() => void) | undefined;
  readonly retry: string;
}) {
  return (
    <div className={styles.chartState} role={props.onRetry ? "alert" : "status"}>
      <span>{props.message}</span>
      {props.onRetry ? (
        <button
          className={styles.retryButton}
          onClick={props.onRetry}
          style={retryButtonStyle}
          type="button"
        >
          {props.retry}
        </button>
      ) : null}
    </div>
  );
}
