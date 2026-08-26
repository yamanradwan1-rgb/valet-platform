"use client";

import Link from "next/link";

import "../../../features/overview/overview.css";

import { Card, SectionHeader } from "../../../components/ui/card";
import { EmptyState, ErrorState } from "../../../components/ui/empty-state";
import { PageHeader } from "../../../components/ui/page-header";
import { FullscreenLoader, Skeleton } from "../../../components/ui/skeleton";
import { useAuth } from "../../../features/auth/use-auth";
import { useDashboardLocation } from "../../../features/location/location-context";
import {
  FinancialCurrencyCard,
  OverviewKpiSkeleton,
  OverviewKpiValue,
  QuickSectionTile,
  SessionStateCountTile,
  type OverviewSectionLink,
} from "../../../features/overview/components/overview-cards";
import {
  deriveVehiclesInService,
  formatOldestAgeSeconds,
  hasCurrentVehicleActivity,
  hasFinancialCurrencies,
  isOldestWaitElevated,
} from "../../../features/overview/overview-view-model";
import { useOverviewData } from "../../../features/overview/use-overview-data";
import { useTranslation } from "../../../i18n/locale-provider";
import type { TranslationKey } from "../../../i18n/translations/types";
import { DashboardApiError } from "../../../lib/api/api-error";

/**
 * D2-002 — Management Dashboard `/overview` on real backend data.
 *
 * Composition (all requests authorized server-side by exact Location ID):
 * - GET .../overview/session-state-counts  (nine canonical states, COMPLETED included)
 * - GET .../analytics/queue                ({ depth, oldestAgeSeconds: string | null })
 * - GET .../overview/financial             (per-currency exact decimal strings)
 *
 * Failure model: one coherent page state. Any failing request produces a
 * single recoverable error surface with retry; no partial cards, no zero
 * substitution, no stale mock data.
 */

const OVERVIEW_SECTIONS: readonly OverviewSectionLink[] = [
  {
    descriptionKey: "overview.sections.sessionsDescription",
    href: "/sessions",
    titleKey: "shell.navSessions",
  },
  {
    descriptionKey: "overview.sections.retrievalQueueDescription",
    href: "/retrieval-queue",
    titleKey: "shell.navRetrievalQueue",
  },
  {
    descriptionKey: "overview.sections.tasksDescription",
    href: "/tasks",
    titleKey: "shell.navTasks",
  },
  {
    descriptionKey: "overview.sections.activeShiftsDescription",
    href: "/active-shifts",
    titleKey: "shell.navActiveShifts",
  },
  {
    descriptionKey: "overview.sections.keysDescription",
    href: "/keys",
    titleKey: "shell.navKeys",
  },
  {
    descriptionKey: "overview.sections.incidentsDescription",
    href: "/incidents",
    titleKey: "shell.navIncidents",
  },
];

function isErrorWithRetry(error: DashboardApiError): boolean {
  return (
    error.kind !== "authorization-masked" &&
    error.kind !== "forbidden" &&
    error.kind !== "session-expired"
  );
}

/** User-friendly message per failure kind; raw codes stay diagnostic-only. */
function overviewErrorMessageKey(error: DashboardApiError): TranslationKey {
  if (
    error.kind === "authorization-masked" ||
    error.kind === "forbidden"
  ) {
    return "overview.error.accessDenied";
  }
  if (error.isNetworkError) return "overview.error.network";
  return "overview.error.loadFailed";
}

export default function OverviewPage() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? "";
  const { state, reload } = useOverviewData(client, locationId);

  if (location === null) {
    // Defensive only since D2-005: LocationGate renders children solely for
    // ready bootstraps holding at least one authorized location, so a real
    // location ID always exists here. Without one no authorized backend
    // call may be made, so the page stays honestly empty.
    return (
      <div className="page-shell">
        <PageHeader
          description={t("page.overview.description")}
          title={t("page.overview.title")}
        />
        <p className="foundation-note">
          {t("placeholder.locationMissingNote")}
        </p>
      </div>
    );
  }

  const ageUnits = {
    minutes: t("overview.duration.minutesUnit"),
    seconds: t("overview.duration.secondsUnit"),
  };
  const unavailableLabel = t("overview.value.unavailable");

  const kpis =
    state.phase === "ready" ? (
      <>
        <OverviewKpiValue
          label={t("overview.kpi.vehiclesInService")}
          sub={t("overview.kpi.vehiclesInServiceSub")}
          value={deriveVehiclesInService(state.data.stateCounts.counts)}
        />
        <OverviewKpiValue
          label={t("overview.kpi.activeRetrievals")}
          sub={t("overview.kpi.queueSub")}
          value={state.data.queue.depth}
        />
        <OverviewKpiValue
          elevated={isOldestWaitElevated(state.data.queue.oldestAgeSeconds)}
          label={t("overview.kpi.oldestWait")}
          sub={t("overview.kpi.queueSub")}
          value={formatOldestAgeSeconds(
            state.data.queue.oldestAgeSeconds,
            unavailableLabel,
            ageUnits,
          )}
        />
        <OverviewKpiValue
          label={t("overview.kpi.locationCurrency")}
          sub={location.timezone ?? undefined}
          value={location.currency ?? unavailableLabel}
        />
      </>
    ) : (
      <>
        <OverviewKpiSkeleton />
        <OverviewKpiSkeleton />
        <OverviewKpiSkeleton />
        <OverviewKpiSkeleton />
      </>
    );

  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.overview.description")}
        title={t("page.overview.title")}
      />
      <p className="overview-note">{t("overview.infoNote")}</p>

      {state.phase === "error" && state.error.kind === "session-expired" ? (
        // Refresh already failed and the shell is redirecting to
        // /session-expired; avoid a misleading retry control meanwhile.
        <FullscreenLoader label={t("session.restoring")} />
      ) : null}

      {state.phase === "error" && state.error.kind !== "session-expired" ? (
        <div className="overview-stack-gap">
          <ErrorState
            message={t(overviewErrorMessageKey(state.error))}
            onRetry={
              isErrorWithRetry(state.error) ? () => reload() : undefined
            }
            retryLabel={isErrorWithRetry(state.error)
              ? t("overview.action.retry")
              : undefined}
          />
          <OperationalSectionsCard />
        </div>
      ) : null}

      {state.phase !== "error" ? (
        <>
          <div className="overview-kpi-grid">{kpis}</div>
          {state.phase === "ready" &&
          !hasCurrentVehicleActivity(
            state.data.stateCounts.counts,
            state.data.queue.depth,
          ) ? (
            <EmptyState message={t("overview.empty.noActivity")} />
          ) : null}
          <div className="overview-columns">
            <Card>
              <SectionHeader
                action={
                  <Link className="overview-link-action" href="/sessions">
                    {t("overview.states.viewSessions")}
                  </Link>
                }
                title={t("overview.states.title")}
              />
              {state.phase === "ready" ? (
                <div className="overview-state-grid">
                  {state.data.stateCounts.counts.map((entry) => (
                    <SessionStateCountTile
                      count={entry.count}
                      key={entry.state}
                      state={entry.state}
                    />
                  ))}
                </div>
              ) : (
                <Skeleton label={t("overview.loading")} lines={6} />
              )}
            </Card>
            <div className="overview-financial-stack">
              {state.phase === "ready" ? (
                hasFinancialCurrencies(state.data.financial) ? (
                  state.data.financial.currencies.map((group) => (
                    <FinancialCurrencyCard group={group} key={group.currency} />
                  ))
                ) : (
                  <Card>
                    <SectionHeader title={t("overview.financial.snapshotTitle")} />
                    <EmptyState
                      message={t("overview.financial.empty")}
                    />
                  </Card>
                )
              ) : (
                <Card>
                  <Skeleton label={t("overview.loading")} lines={4} />
                </Card>
              )}
            </div>
          </div>
          <OperationalSectionsCard />
        </>
      ) : null}
    </div>
  );
}

function OperationalSectionsCard() {
  const { t } = useTranslation();
  return (
    <Card className="overview-sections">
      <SectionHeader title={t("overview.sections.title")} />
      <div className="overview-quick-grid">
        {OVERVIEW_SECTIONS.map((section) => (
          <QuickSectionTile
            descriptionKey={section.descriptionKey}
            href={section.href}
            key={section.href}
            titleKey={section.titleKey}
          />
        ))}
      </div>
    </Card>
  );
}
