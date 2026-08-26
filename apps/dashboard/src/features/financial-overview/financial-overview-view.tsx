"use client";

import "./financial-overview.css";

import type { FinancialOverviewCurrencyGroup } from "@valet/contracts";

import { Skeleton } from "../../components/ui/skeleton";
import { EmptyState, ErrorState } from "../../components/ui/empty-state";
import { StatusBadge } from "../../components/ui/status-badge";
import { collectionMethodLabelKey } from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";
import { DashboardApiError } from "../../lib/api/api-error";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import {
  formatCurrencyAmount,
  formatPaymentCount,
  hasCurrencyGroups,
  isCurrentLocationCurrency,
} from "./financial-overview-display";
import { useFinancialOverview } from "./use-financial-overview";

/**
 * D4-001 — Financial Overview page body.
 *
 * One coherent page state at a time (loading / ready / empty / error), driven
 * entirely by the race-safe loader snapshot. Money values are the exact
 * decimal strings received per currency group; currencies are never merged,
 * converted or totaled across groups. There are no payment/refund/validation
 * mutation affordances: this surface is read-only by contract.
 */

/** Exported for error-semantics tests; raw backend codes stay diagnostic. */
export function errorMessageKey(error: DashboardApiError): TranslationKey {
  if (error.kind === "authorization-masked" || error.kind === "forbidden") {
    return "financial.error.accessDenied";
  }
  if (error.isNetworkError) return "financial.error.network";
  return "financial.error.loadFailed";
}

export function canRetry(error: DashboardApiError): boolean {
  return (
    error.kind !== "authorization-masked" &&
    error.kind !== "forbidden" &&
    error.kind !== "session-expired"
  );
}

interface FactEntry {
  readonly label: string;
  readonly value: string;
}

function currencyFactEntries(
  group: FinancialOverviewCurrencyGroup,
  labels: {
    paymentCount: string;
    amountDue: string;
    amountPaid: string;
    tips: string;
    succeededRefunds: string;
    currentValidationAmount: string;
  },
): FactEntry[] {
  return [
    { label: labels.paymentCount, value: formatPaymentCount(group) },
    {
      label: labels.amountDue,
      value: formatCurrencyAmount(group.currency, group.amountDueTotal),
    },
    {
      label: labels.amountPaid,
      value: formatCurrencyAmount(group.currency, group.amountPaidTotal),
    },
    {
      label: labels.tips,
      value: formatCurrencyAmount(group.currency, group.tipAmountTotal),
    },
    {
      label: labels.succeededRefunds,
      value: formatCurrencyAmount(
        group.currency,
        group.succeededRefundAmountTotal,
      ),
    },
    {
      label: labels.currentValidationAmount,
      value: formatCurrencyAmount(
        group.currency,
        group.currentValidationAmountTotal,
      ),
    },
  ];
}

function CurrencyGroupCard({
  group,
  locationCurrency,
}: {
  group: FinancialOverviewCurrencyGroup;
  locationCurrency: string | null;
}) {
  const { t } = useTranslation();
  return (
    <section className="card finov-card">
      <div className="finov-group-header">
        <div>
          <p className="finov-group-eyebrow">
            {t("financial.currencyGroupLabel")}
          </p>
          <h2 className="finov-group-currency">{group.currency}</h2>
        </div>
        {isCurrentLocationCurrency(group, locationCurrency) ? (
          <span className="finov-current-badge">
            {t("financial.currentLocationCurrency")}
          </span>
        ) : null}
      </div>
      <div className="finov-fact-grid">
        {currencyFactEntries(group, {
          paymentCount: t("financial.fact.paymentCount"),
          amountDue: t("financial.fact.amountDue"),
          amountPaid: t("financial.fact.amountPaid"),
          tips: t("financial.fact.tips"),
          succeededRefunds: t("financial.fact.succeededRefunds"),
          currentValidationAmount: t(
            "financial.fact.currentValidationAmount",
          ),
        }).map((fact) => (
          <div className="finov-fact" key={fact.label}>
            <p className="finov-fact-label">{fact.label}</p>
            <p className="finov-fact-value">{fact.value}</p>
          </div>
        ))}
      </div>
      <div className="finov-count-columns">
        <div>
          <h3 className="finov-count-title">
            {t("financial.statusCountsTitle")}
          </h3>
          <ul className="finov-count-list">
            {group.statusCounts.map((entry) => (
              <li className="finov-count-row" key={entry.status}>
                <StatusBadge variant="payment" value={entry.status} />
                <span className="finov-count-value">{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="finov-count-title">
            {t("financial.collectionMethodsTitle")}
          </h3>
          <ul className="finov-count-list">
            {group.collectionMethodCounts.map((entry) => (
              <li className="finov-count-row" key={entry.method}>
                <span className="finov-method-label">
                  {t(collectionMethodLabelKey(entry.method))}
                </span>
                <span className="finov-count-value">{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function FinancialOverviewView() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? null;
  const { snapshot, retry } = useFinancialOverview(client, locationId);

  if (location === null) {
    return (
      <p className="foundation-note">
        {t("placeholder.locationMissingNote")}
      </p>
    );
  }

  return (
    <>
      <p className="finov-note">{t("financial.infoNote")}</p>

      {snapshot.phase === "error" &&
      snapshot.error.kind === "session-expired" ? (
        // The shared auth flow is redirecting to /session-expired; a retry
        // control would be misleading here.
        <Skeleton label={t("session.restoring")} lines={6} />
      ) : null}

      {snapshot.phase === "error" &&
      snapshot.error.kind !== "session-expired" ? (
        <ErrorState
          message={t(errorMessageKey(snapshot.error))}
          onRetry={canRetry(snapshot.error) ? retry : undefined}
          retryLabel={
            canRetry(snapshot.error) ? t("financial.action.retry") : undefined
          }
        />
      ) : null}

      {snapshot.phase === "loading" || snapshot.phase === "idle" ? (
        <div className="finov-stack" aria-live="polite">
          {[0, 1].map((key) => (
            <section className="card finov-card" key={key}>
              <Skeleton label={t("financial.loading")} lines={7} />
            </section>
          ))}
        </div>
      ) : null}

      {snapshot.phase === "ready" ? (
        hasCurrencyGroups(snapshot.data) ? (
          <div className="finov-stack">
            {snapshot.data.currencies.map((group) => (
              <CurrencyGroupCard
                group={group}
                key={group.currency}
                locationCurrency={location.currency ?? null}
              />
            ))}
          </div>
        ) : (
          <EmptyState message={t("financial.empty")} />
        )
      ) : null}
    </>
  );
}
