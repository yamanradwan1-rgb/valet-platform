"use client";

import { Calendar, ChevronDown, X } from "lucide-react";
import {
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { selectedScopePresentation } from "../../components/foundation/scope-presentation";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { BidiText } from "../../components/presentation/panel";
import { FocusDialog } from "../../components/presentation/focus-dialog";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { AnalyticsActivityChart } from "./analytics-activity-chart";
import { AnalyticsCards, AnalyticsCoverage } from "./analytics-coverage";
import {
  analyticsCopy,
  analyticsPeriodMessage,
  analyticsValidationCopy,
} from "./analytics-copy";
import {
  companyAnalyticsPresentation,
  locationAnalyticsPresentation,
  useRawAnalyticsPeriod,
  validateAnalyticsPeriod,
  type AnalyticsPeriodValidation,
  type RawAnalyticsPeriod,
} from "./analytics-presentation";
import { AnalyticsSecondaryChart } from "./analytics-secondary-chart";
import {
  readCompanyAnalytics,
  readLocationFinancialAnalytics,
  readLocationIncidentAnalytics,
  readLocationKpiAnalytics,
  readLocationOperationalAnalytics,
} from "./intelligence-api";
import periodStyles from "./intelligence-period.module.css";
import { intelligenceScope } from "./intelligence-scope";
import { useExplicitAnalyticsPeriod } from "./use-explicit-analytics-period";
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
  const { applyPeriod: persistPeriod } = useExplicitAnalyticsPeriod();
  const rawPeriod = useRawAnalyticsPeriod();
  const periodValidation = validateAnalyticsPeriod(rawPeriod.from, rawPeriod.to);
  const period = periodValidation.kind === "valid" ? periodValidation.period : null;
  const descriptorPeriod = period ?? { from: "", to: "" };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftError, setDraftError] = useState<AnalyticsPeriodValidation["kind"] | null>(null);

  function closeDialog() {
    setDialogOpen(false);
  }

  const company = useIntelligenceRead({
    descriptor: { endpointFamily: "COMPANY_ANALYTICS", ...descriptorPeriod },
    enabled: scope?.kind === "COMPANY" && period !== null,
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
  const message = analyticsPeriodMessage(locale, periodValidation, readError, loading);
  const scopeLabel = scope.kind === "COMPANY"
    ? uiCopy("allLocations")
    : scopePresentation.location?.label ?? uiCopy("location");

  function openDialog() {
    setDraftFrom(rawPeriod.from ?? "");
    setDraftTo(rawPeriod.to ?? "");
    setDraftError(null);
    setDialogOpen(true);
  }

  function applyPeriod(event: FormEvent) {
    event.preventDefault();
    const next = validateAnalyticsPeriod(draftFrom, draftTo);
    if (next.kind !== "valid") {
      setDraftError(next.kind);
      return;
    }
    persistPeriod(next.period);
    setDraftError(null);
    closeDialog();
  }

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
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className={styles.headerActions} data-testid="analytics-header-selectors">
          <PeriodButton onClick={openDialog} rawPeriod={rawPeriod} label={t.selectPeriod} />
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
        <ChartPanel title={t.vehicleActivity} period={rawPeriod} periodLabel={t.selectPeriod} onPeriod={openDialog}>
          {message ? <ChartState message={message} onRetry={readError ? retry : undefined} retry={t.retry} /> : presentation ? (
            <AnalyticsActivityChart data={presentation.activity} locale={locale} />
          ) : null}
        </ChartPanel>
        <ChartPanel title={t.durationComparison} period={rawPeriod} periodLabel={t.selectPeriod} onPeriod={openDialog}>
          {message ? <ChartState message={message} onRetry={readError ? retry : undefined} retry={t.retry} /> : presentation ? (
            <>
              <AnalyticsSecondaryChart data={presentation.durations} locale={locale} />
              <AnalyticsCoverage locale={locale} presentation={presentation} />
            </>
          ) : null}
        </ChartPanel>
      </div>

      {dialogOpen ? (
        <div className={periodStyles.periodHost}>
          <FocusDialog label={t.periodDialog} onClose={closeDialog}>
            <header className={periodStyles.periodDialogHeader}><h2>{t.periodDialog}</h2></header>
            <form className={periodStyles.periodForm} onSubmit={applyPeriod}>
              <div className={periodStyles.periodFields}>
                <label className={periodStyles.periodField}>{t.from}
                  <input aria-label={t.from} onChange={(event) => setDraftFrom(event.target.value)} type="date" value={draftFrom} />
                </label>
                <label className={periodStyles.periodField}>{t.to}
                  <input aria-label={t.to} onChange={(event) => setDraftTo(event.target.value)} type="date" value={draftTo} />
                </label>
              </div>
              {draftError ? (
                <p className={periodStyles.periodError} role="alert">
                  {analyticsValidationCopy(locale, draftError)}
                </p>
              ) : null}
              <div className={periodStyles.periodActions}>
                <button className={periodStyles.periodCancel} onClick={closeDialog} type="button">{t.cancel}</button>
                <button className={periodStyles.periodApply} type="submit">{t.apply}</button>
              </div>
            </form>
            <button aria-label={t.cancel} className={periodStyles.periodDialogClose} onClick={closeDialog} type="button">
              <X aria-hidden="true" size={20} />
            </button>
          </FocusDialog>
        </div>
      ) : null}
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
  readonly onPeriod: () => void;
  readonly period: RawAnalyticsPeriod;
  readonly periodLabel: string;
  readonly title: string;
}) {
  return (
    <section className={styles.chartPanel} data-testid="analytics-chart-panel">
      <div className={styles.chartHeader}>
        <h2>{props.title}</h2>
        <PeriodButton
          compact
          label={props.periodLabel}
          onClick={props.onPeriod}
          rawPeriod={props.period}
        />
      </div>
      {props.children}
    </section>
  );
}

function PeriodButton(props: {
  readonly compact?: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly rawPeriod: RawAnalyticsPeriod;
}) {
  const hasRawPeriod = props.rawPeriod.from !== null || props.rawPeriod.to !== null;
  const content = `${props.rawPeriod.from ?? "?"} – ${props.rawPeriod.to ?? "?"}`;
  return (
    <button
      aria-haspopup="dialog"
      className={props.compact ? styles.chartPeriod : styles.periodButton}
      onClick={props.onClick}
      type="button"
    >
      <Calendar aria-hidden="true" size={props.compact ? 14 : 16} />
      {hasRawPeriod ? <BidiText kind="number">{content}</BidiText> : props.label}
      <ChevronDown aria-hidden="true" size={props.compact ? 12 : 14} />
    </button>
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
