"use client";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../help/scoped-context-help";
import helpStyles from "./intelligence-help.module.css";
import {
  readCompanyAnalytics,
  readLocationFinancialAnalytics,
  readLocationFinancialOverview,
} from "./intelligence-api";
import { DashboardPeriodControl } from "./dashboard-period-control";
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
import { useDashboardPeriod } from "./use-dashboard-period";

export function PaymentsPage() {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = paymentsCopy(locale);
  const scope = intelligenceScope(dashboard.selectedScope);
  const periodState = useDashboardPeriod();
  const { period, validation } = periodState;
  const descriptorPeriod = period ?? { from: "", to: "" };

  const company = useIntelligenceRead({
    descriptor: { endpointFamily: "COMPANY_ANALYTICS", ...descriptorPeriod },
    enabled: scope?.kind === "COMPANY" && period !== null,
    preserveOnRetry: true,
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
    preserveOnRetry: true,
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
  const periodInvalid = validation.kind !== "required" && validation.kind !== "valid";
  const periodErrorMessage = periodInvalid ? t.invalidPeriod : periodReadError ? errorMessage(periodReadError, t) : null;
  const currentGenerationKey = period
    ? `${period.from}:${period.to}`
    : "no-period";

  function retryPeriod() {
    if (scopeKind === "COMPANY") company.retry();
    else financial.retry();
  }

  return (
    <div className={styles.page} data-testid="md05-payments-page">
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <div className={helpStyles.headingRow}>
            <h1>{t.title}</h1>
            <ScopedContextHelp helpKey="payments.page" />
          </div>
          <p>{scope.kind === "COMPANY" ? t.companySubtitle : t.locationSubtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <DashboardPeriodControl helpKey="payments.period" onRefresh={retryPeriod} refreshing={periodLoading && Boolean(periodPresentation)} scopeKind={scope.kind} state={periodState} />
        </div>
      </div>
      <PaymentsSummaryGrid
        errorMessage={periodErrorMessage}
        loading={periodLoading && !periodPresentation}
        locale={locale}
        periodSelected={validation.kind !== "required"}
        presentation={periodPresentation}
      />
      <PaymentsBreakdownRead
        key={currentGenerationKey}
        locale={locale}
        mode={scope.kind}
        onRetryPeriod={retryPeriod}
        period={periodPresentation}
        periodError={periodErrorMessage}
        periodLoading={periodLoading && !periodPresentation}
        periodSelected={validation.kind !== "required"}
      />
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
