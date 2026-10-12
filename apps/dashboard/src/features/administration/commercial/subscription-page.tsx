"use client";

import { CheckCircle2, Receipt, XCircle } from "lucide-react";
import { useCallback } from "react";

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
import { ReadState, StatusBadge, styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import {
  readCompanySubscription,
  readLocationSubscription,
} from "./commercial-api";

export function SubscriptionPage() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const allowed =
    scope.authority === "COMPANY_ADMIN" ||
    scope.authority === "COMPANY_ADMIN_SUBSCRIPTION" ||
    scope.authority === "LOCATION_MANAGER";
  const load = useCallback(
    (signal: AbortSignal) => {
      if (scope.authority === "LOCATION_MANAGER") {
        if (!scope.locationId)
          return Promise.reject(new Error(t.exactLocationRequired));
        return readLocationSubscription(
          dashboard.api,
          scope.locationId,
          signal,
        ).then((response) => response.subscription);
      }
      if (
        scope.authority === "COMPANY_ADMIN" ||
        scope.authority === "COMPANY_ADMIN_SUBSCRIPTION"
      ) {
        return readCompanySubscription(
          dashboard.api,
          scope.organizationId,
          signal,
        ).then((response) => response.subscription);
      }
      return Promise.reject(new Error("Not authorized."));
    },
    [
      dashboard.api,
      scope.authority,
      scope.locationId,
      scope.organizationId,
      t.exactLocationRequired,
    ],
  );
  const state = useAuthoritativeRead(`${scopeKey}:subscription`, load, allowed);
  if (!allowed) return null;
  const subscription = state.data;
  const entitlements = subscription
    ? ([
        [t.dashboardAccess, subscription.entitlements.dashboardAccess],
        [t.reportExports, subscription.entitlements.reportExports],
        [t.basicBranding, subscription.entitlements.basicBranding],
      ] as const)
    : [];
  const statusLabel =
    subscription?.status === "ACTIVE"
      ? t.active
      : subscription?.status === "TRIAL"
        ? t.trial
        : t.suspended;
  return (
    <AdministrationPage
      helpInGap
      action={<ScopedContextHelp helpKey="billing.page" />}
      icon={Receipt}
      subtitle={t.billingSubtitle}
      title={t.billingTitle}
    >
      <ReadState
        error={
          state.error
            ? new Error(administrationErrorMessage(state.error))
            : null
        }
        loading={state.loading}
        onRetry={state.refresh}
      >
        {!subscription ? (
          <div className={`${styles.card} ${styles.empty}`}>
            {t.noSubscription}
          </div>
        ) : (
          <>
            <div className={styles.grid3}>
              <div
                className={`${styles.card} ${styles.billingCardPad} ${styles.span2}`}
                style={{ position: "relative", paddingInlineEnd: "4rem" }}
              >
                <span
                  style={{ position: "absolute", insetBlockStart: "1rem", insetInlineEnd: "1rem" }}
                >
                  <ScopedContextHelp helpKey="billing.status" />
                </span>
                <div className={styles.muted}>{t.planCode}</div>
                <h2 className={styles.planTitle}>
                  <bdi dir="ltr">{subscription.planCode}</bdi>
                </h2>
                <p className={styles.sectionText}>{t.readOnly}</p>
              </div>
              <div className={`${styles.card} ${styles.billingCardPad}`}>
                <div className={styles.muted}>{t.subscriptionStatus}</div>
                <div className={styles.factValue}>{statusLabel}</div>
                <StatusBadge good={subscription.status === "ACTIVE"}>
                  {statusLabel}
                </StatusBadge>
              </div>
            </div>
            <div className={styles.card}>
              <div
                className={styles.billingSectionHeader}
                style={{ position: "relative", paddingInlineEnd: "4rem" }}
              >
                <h2 className={styles.billingSectionTitle}>{t.entitlements}</h2>
                <span
                  style={{
                    position: "absolute",
                    insetBlockStart: "50%",
                    insetInlineEnd: "1rem",
                    transform: "translateY(-50%)",
                  }}
                >
                  <ScopedContextHelp helpKey="billing.entitlements" />
                </span>
              </div>
              <div
                aria-label={t.entitlements}
                className={styles.tableWrap}
                role="region"
                tabIndex={0}
              >
                <table className={`${styles.table} ${styles.billingTable}`}>
                  <thead>
                    <tr>
                      <th>{t.entitlements}</th>
                      <th>{t.currentStatus}</th>
                      <th>{t.readOnly}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entitlements.map(([label, enabled]) => (
                      <tr key={label}>
                        <td className={styles.strong}>{label}</td>
                        <td>
                          <span className={styles.actions}>
                            {enabled ? (
                              <CheckCircle2 aria-hidden="true" size={18} />
                            ) : (
                              <XCircle aria-hidden="true" size={18} />
                            )}
                            <StatusBadge good={enabled}>
                              {enabled ? t.enabled : t.disabled}
                            </StatusBadge>
                          </span>
                        </td>
                        <td>
                          <span className={styles.badge}>{t.readOnly}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </ReadState>
    </AdministrationPage>
  );
}
