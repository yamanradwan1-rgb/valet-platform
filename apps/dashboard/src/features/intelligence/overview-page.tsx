"use client";

import type { AnalyticsPeriodQuery } from "@valet/contracts";
import { AlertTriangle, Car, ChevronDown, Clock, Users, X } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { FocusDialog } from "../../components/presentation/focus-dialog";
import { BidiText } from "../../components/presentation/panel";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import {
  readCompanyAnalytics,
  readLocationIncidentAnalytics,
  readLocationKpiAnalytics,
  readLocationOperationalAnalytics,
} from "./intelligence-api";
import { formatExactDecimal } from "./intelligence-format";
import { intelligenceScope } from "./intelligence-scope";
import { OverviewActivityChart } from "./overview-activity-chart";
import { overviewCopy } from "./overview-copy";
import {
  OverviewCurrentPanel,
  OverviewLocationCurrentRead,
} from "./overview-current-panel";
import {
  OverviewMetricCard,
  OverviewPanelState,
} from "./overview-page-ui";
import {
  companyOverviewPresentation,
  locationOverviewPresentation,
} from "./overview-presentation";
import styles from "./overview.module.css";
import periodStyles from "./intelligence-period.module.css";
import { useIntelligenceRead } from "./use-intelligence-read";
import {
  explicitAnalyticsPeriod,
  useExplicitAnalyticsPeriod,
} from "./use-explicit-analytics-period";

export function OverviewPage() {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = overviewCopy(locale);
  const scope = intelligenceScope(dashboard.selectedScope);
  const { applyPeriod: persistPeriod, period } = useExplicitAnalyticsPeriod();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [periodError, setPeriodError] = useState(false);
  const closePeriodDialog = useCallback(() => setDialogOpen(false), []);
  function openPeriodDialog() {
    setDraftFrom(period?.from ?? "");
    setDraftTo(period?.to ?? "");
    setPeriodError(false);
    setDialogOpen(true);
  }
  const descriptorPeriod = period ?? { from: "", to: "" };

  const company = useIntelligenceRead({
    descriptor: { endpointFamily: "COMPANY_ANALYTICS", ...descriptorPeriod },
    enabled: scope?.kind === "COMPANY" && period !== null,
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

  function applyPeriod(event: FormEvent) {
    event.preventDefault();
    const next = explicitAnalyticsPeriod(draftFrom, draftTo);
    if (!next) {
      setPeriodError(true);
      return;
    }
    setPeriodError(false);
    persistPeriod(next);
    closePeriodDialog();
  }

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
      </div>
      <div className={styles.metricGrid}>
        <OverviewMetricCard
          available={presentation !== null}
          context={presentation ? `${presentation.activeEmployeeCount} ${t.activeEmployees}` : stateText(period, periodLoading, periodReadError, t)}
          icon={<Car size={20} />}
          label={t.carsHandled}
          value={presentation ? String(presentation.carsHandled) : t.unavailable}
        />
        <OverviewMetricCard
          available={presentation?.slaCompliance.percentage !== null && presentation !== null}
          context={presentation
            ? `${presentation.slaCompliance.numerator}/${presentation.slaCompliance.denominator} · ${presentation.slaCompliance.missingTargetCount} ${t.missingTargets} · ${presentation.slaCompliance.invalidOrMissingIntervalCount} ${t.invalidIntervals}`
            : stateText(period, periodLoading, periodReadError, t)}
          icon={<Users size={20} />}
          label={t.slaCompliance}
          value={presentation?.slaCompliance.percentage === null || !presentation
            ? t.unavailable
            : `${presentation.slaCompliance.percentage}%`}
        />
        <OverviewMetricCard
          available={presentation?.retrievalWaitAverageSeconds !== null && presentation !== null}
          context={presentation ? `${presentation.retrievalWaitSampleCount} ${t.samples}` : stateText(period, periodLoading, periodReadError, t)}
          icon={<Clock size={20} />}
          label={t.retrievalWait}
          value={presentation?.retrievalWaitAverageSeconds === null || !presentation
            ? t.unavailable
            : `${formatExactDecimal(presentation.retrievalWaitAverageSeconds, locale)} ${t.seconds}`}
        />
        <OverviewMetricCard
          available={presentation !== null}
          context={presentation ? t.selectedPeriod : stateText(period, periodLoading, periodReadError, t)}
          danger
          icon={<AlertTriangle size={20} />}
          label={t.incidents}
          value={presentation ? String(presentation.incidentCount) : t.unavailable}
        />
      </div>
      <div className={styles.lowerGrid}>
        <section className={[styles.panel, styles.activityPanel].join(" ")}>
          <div className={styles.panelHeader}>
            <h2>{t.activity}</h2>
            <button
              aria-haspopup="dialog"
              className={periodStyles.periodButton}
              onClick={openPeriodDialog}
              type="button"
            >
              {period ? <BidiText kind="number">{`${period.from} – ${period.to}`}</BidiText> : t.selectPeriod}
              <ChevronDown aria-hidden="true" size={14} />
            </button>
          </div>
          {!period ? (
            <OverviewPanelState message={t.periodRequired} />
          ) : periodLoading ? (
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
            loading={periodLoading}
            locale={locale}
            mode="COMPANY"
            onRetry={retryPeriod}
            periodSelected={period !== null}
          />
        )}
      </div>
      {dialogOpen ? (
        <div className={periodStyles.periodHost}>
          <FocusDialog label={t.periodDialog} onClose={closePeriodDialog}>
            <header className={periodStyles.periodDialogHeader}>
              <h2>{t.periodDialog}</h2>
            </header>
            <form className={periodStyles.periodForm} onSubmit={applyPeriod}>
              <div className={periodStyles.periodFields}>
                <label className={periodStyles.periodField}>
                  {t.from}
                  <input
                    aria-label={t.from}
                    onChange={(event) => setDraftFrom(event.target.value)}
                    type="date"
                    value={draftFrom}
                  />
                </label>
                <label className={periodStyles.periodField}>
                  {t.to}
                  <input
                    aria-label={t.to}
                    onChange={(event) => setDraftTo(event.target.value)}
                    type="date"
                    value={draftTo}
                  />
                </label>
              </div>
              {periodError ? (
                <p className={periodStyles.periodError} role="alert">{t.invalidPeriod}</p>
              ) : null}
              <div className={periodStyles.periodActions}>
                <button className={periodStyles.periodCancel} onClick={closePeriodDialog} type="button">
                  {t.cancel}
                </button>
                <button className={periodStyles.periodApply} type="submit">{t.apply}</button>
              </div>
            </form>
            <button
              aria-label={t.cancel}
              className={periodStyles.periodDialogClose}
              onClick={closePeriodDialog}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </FocusDialog>
        </div>
      ) : null}
    </div>
  );
}

function stateText(period: AnalyticsPeriodQuery | null, loading: boolean, error: unknown, t: ReturnType<typeof overviewCopy>) {
  if (!period) return t.periodRequired;
  if (loading) return t.loading;
  if (error) return errorMessage(error, t);
  return t.unavailable;
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
