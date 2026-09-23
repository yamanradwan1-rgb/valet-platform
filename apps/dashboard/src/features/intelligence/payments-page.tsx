"use client";

import { Calendar, ChevronDown, X } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";

import { FocusDialog } from "../../components/presentation/focus-dialog";
import { BidiText } from "../../components/presentation/panel";
import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import {
  readCompanyAnalytics,
  readLocationFinancialAnalytics,
  readLocationFinancialOverview,
} from "./intelligence-api";
import periodStyles from "./intelligence-period.module.css";
import { intelligenceScope } from "./intelligence-scope";
import { PaymentsBreakdownTable } from "./payments-breakdown-table";
import { paymentsCopy } from "./payments-copy";
import {
  companyPaymentsPeriodPresentation,
  currentPaymentsPresentation,
  locationPaymentsPeriodPresentation,
} from "./payments-presentation";
import { PaymentsSummaryGrid } from "./payments-summary-grid";
import styles from "./payments.module.css";
import { useIntelligenceRead } from "./use-intelligence-read";
import {
  explicitAnalyticsPeriod,
  useExplicitAnalyticsPeriod,
} from "./use-explicit-analytics-period";

export function PaymentsPage() {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = paymentsCopy(locale);
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
      if (readScope.kind !== "COMPANY" || !period) {
        throw new Error("Company financial period read mismatch");
      }
      return readCompanyAnalytics(api, readScope.organizationId, period, signal);
    },
  });
  const financial = useIntelligenceRead({
    descriptor: { endpointFamily: "LOCATION_FINANCIAL_ANALYTICS", ...descriptorPeriod },
    enabled: scope?.kind === "LOCATION" && period !== null,
    load: ({ api, scope: readScope, signal }) => {
      if (readScope.kind !== "LOCATION" || !period) {
        throw new Error("Location financial period read mismatch");
      }
      return readLocationFinancialAnalytics(api, readScope.locationId, period, signal);
    },
  });

  if (!scope) return null;
  const scopeKind = scope.kind;
  const periodPresentation = scope.kind === "COMPANY"
    ? (company.data ? companyPaymentsPeriodPresentation(company.data) : null)
    : (financial.data ? locationPaymentsPeriodPresentation(financial.data) : null);
  const periodLoading = scope.kind === "COMPANY" ? company.loading : financial.loading;
  const periodReadError = scope.kind === "COMPANY" ? company.error : financial.error;
  const periodErrorMessage = periodReadError ? errorMessage(periodReadError, t) : null;
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
    else financial.retry();
  }

  return (
    <div className={styles.page} data-testid="md05-payments-page">
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h1>{t.title}</h1>
          <p>{scope.kind === "COMPANY" ? t.companySubtitle : t.locationSubtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <button
            aria-haspopup="dialog"
            className={styles.paymentsPeriodButton}
            onClick={openPeriodDialog}
            type="button"
          >
            <Calendar aria-hidden="true" size={16} />
            {period ? (
              <BidiText kind="number">{period.from} – {period.to}</BidiText>
            ) : t.selectPeriod}
            <ChevronDown aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
      <PaymentsSummaryGrid
        errorMessage={periodErrorMessage}
        loading={periodLoading}
        locale={locale}
        periodSelected={period !== null}
        presentation={periodPresentation}
      />
      <PaymentsBreakdownRead
        key={currentGenerationKey}
        locale={locale}
        mode={scope.kind}
        onRetryPeriod={retryPeriod}
        period={periodPresentation}
        periodError={periodErrorMessage}
        periodLoading={periodLoading}
        periodSelected={period !== null}
      />
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

function errorMessage(error: unknown, t: ReturnType<typeof paymentsCopy>) {
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

function PaymentsBreakdownRead(props: {
  readonly locale: ReturnType<typeof useDashboardLocale>["locale"];
  readonly mode: "COMPANY" | "LOCATION";
  readonly onRetryPeriod: () => void;
  readonly period: ReturnType<typeof companyPaymentsPeriodPresentation> | null;
  readonly periodError: string | null;
  readonly periodLoading: boolean;
  readonly periodSelected: boolean;
}) {
  const current = useIntelligenceRead({
    descriptor: { endpointFamily: "LOCATION_FINANCIAL_OVERVIEW" },
    enabled: props.mode === "LOCATION",
    load: ({ api, scope, signal }) => {
      if (scope.kind !== "LOCATION") {
        throw new Error("Location financial overview read mismatch");
      }
      return readLocationFinancialOverview(api, scope.locationId, signal);
    },
  });
  const presentation = current.data
    ? currentPaymentsPresentation(current.data)
    : null;
  const t = paymentsCopy(props.locale);
  return (
    <PaymentsBreakdownTable
      current={presentation}
      currentError={current.error ? errorMessage(current.error, t) : null}
      currentLoading={props.mode === "LOCATION" ? current.loading : false}
      locale={props.locale}
      mode={props.mode}
      onRetryCurrent={current.retry}
      onRetryPeriod={props.onRetryPeriod}
      period={props.period}
      periodError={props.periodError}
      periodLoading={props.periodLoading}
      periodSelected={props.periodSelected}
    />
  );
}
