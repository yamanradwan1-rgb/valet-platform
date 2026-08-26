"use client";

import { useMemo, useState } from "react";

import "./reports.css";

import type { ReportKind } from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { ErrorState } from "../../components/ui/empty-state";
import { FullscreenLoader, Skeleton } from "../../components/ui/skeleton";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";
import { DashboardApiError } from "../../lib/api/api-error";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";

import { ReportsCurrenciesSection } from "./reports-currencies-section";
import { ReportsDailyActivitySection } from "./reports-daily-activity-section";
import { ReportsExportCard } from "./reports-export-card";
import { ReportsIncidentsSection } from "./reports-incidents-section";
import { ReportMetricSkeleton } from "./reports-metric-cards";
import {
  defaultReportPeriodValue,
  draftValueForKind,
  type ReportPeriodDrafts,
} from "./reports-period";
import {
  KIND_LABEL_KEYS,
  ReportsPeriodControls,
} from "./reports-period-controls";
import { ReportsSummarySection } from "./reports-summary-section";
import { useReportExport } from "./use-report-export";
import { useReportsData } from "./use-reports-data";

/**
 * D4-002 — Reports page body.
 *
 * The workspace is keyed by location id, so an A→B location switch remounts
 * it: drafts reset to the new location's local defaults and every old
 * snapshot is gone before the first B request leaves. Reads go through the
 * race-safe (locationId, kind, period)-identity loader; exports run through
 * their own identity-gated state machine beside the report snapshot.
 */

/** Exported for error-semantics tests; raw backend codes stay diagnostic. */
export function reportErrorMessageKey(
  error: DashboardApiError,
): TranslationKey {
  if (error.kind === "authorization-masked" || error.kind === "forbidden") {
    return "errors.accessDenied";
  }
  if (error.isNetworkError) return "reports.error.network";
  return "errors.requestFailed";
}

export function canRetryReport(error: DashboardApiError): boolean {
  return (
    error.kind !== "authorization-masked" &&
    error.kind !== "forbidden" &&
    error.kind !== "session-expired"
  );
}

export function ReportsView() {
  const { t } = useTranslation();
  const location = useDashboardLocation();

  if (location === null) {
    return (
      <p className="foundation-note">{t("placeholder.locationMissingNote")}</p>
    );
  }

  // Remounting per location resets drafts to local defaults and guarantees
  // zero stale snapshots across A→B switches.
  return (
    <ReportsWorkspace
      key={location.locationId}
      locationId={location.locationId}
      timezone={location.timezone}
    />
  );
}

interface AppliedSelection {
  readonly kind: ReportKind;
  readonly periodValue: string;
}

function ReportsWorkspace({
  locationId,
  timezone,
}: {
  locationId: string;
  timezone: string;
}) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [kind, setKind] = useState<ReportKind>("DAILY");
  const defaults = useMemo<ReportPeriodDrafts>(
    () => ({
      date: defaultReportPeriodValue("DAILY", timezone),
      month: defaultReportPeriodValue("MONTHLY", timezone),
      weekStart: defaultReportPeriodValue("WEEKLY", timezone),
    }),
    [timezone],
  );
  const [drafts, setDrafts] = useState<ReportPeriodDrafts>(defaults);
  const [applied, setApplied] = useState<AppliedSelection>({
    kind: "DAILY",
    periodValue: defaults.date,
  });

  const draftValue = draftValueForKind(drafts, kind);

  const { retry, snapshot } = useReportsData(client, {
    kind: applied.kind,
    locationId,
    periodValue: applied.periodValue,
  });
  const exportApi = useReportExport(client, {
    kind: applied.kind,
    locationId,
    periodValue: applied.periodValue,
  });

  return (
    <>
      <p className="rep-note">{t("reports.infoNote")}</p>

      <ReportsPeriodControls
        appliedKind={applied.kind}
        appliedValue={applied.periodValue}
        drafts={drafts}
        kind={kind}
        maxDate={defaults.date}
        onDraftChange={setDrafts}
        onKindChange={setKind}
        onLoad={() =>
          setApplied({ kind, periodValue: draftValue })
        }
      />

      {snapshot.phase === "error" &&
      snapshot.error.kind === "session-expired" ? (
        <FullscreenLoader label={t("session.restoring")} />
      ) : null}

      {snapshot.phase === "error" &&
      snapshot.error.kind !== "session-expired" ? (
        <ErrorState
          message={t(reportErrorMessageKey(snapshot.error))}
          onRetry={canRetryReport(snapshot.error) ? retry : undefined}
          retryLabel={
            canRetryReport(snapshot.error) ? t("actions.retry") : undefined
          }
        />
      ) : null}

      {snapshot.phase === "loading" || snapshot.phase === "idle" ? (
        <div aria-live="polite" className="rep-section-stack">
          <div className="rep-metric-grid rep-metric-grid-5">
            {[0, 1, 2, 3, 4].map((key) => (
              <ReportMetricSkeleton key={key} />
            ))}
          </div>
          <Card>
            <Skeleton label={t("reports.loading")} lines={6} />
          </Card>
        </div>
      ) : null}

      {snapshot.phase === "ready" ? (
        <div className="rep-section-stack">
          <p className="rep-envelope">
            {`${t(KIND_LABEL_KEYS[snapshot.data.kind])} · ${t("analytics.period.reportedLabel")}: ${snapshot.data.periodFrom} → ${snapshot.data.periodTo} · ${snapshot.data.timezone}`}
          </p>
          <ReportsSummarySection summary={snapshot.data.summary} />
          <ReportsCurrenciesSection summary={snapshot.data.summary} />
          <ReportsIncidentsSection summary={snapshot.data.summary} />
          {("dailyActivity" in snapshot.data) ? (
            <ReportsDailyActivitySection
              activity={snapshot.data.dailyActivity}
            />
          ) : null}
          <ReportsExportCard
            identityReady
            onStart={exportApi.startExport}
            state={exportApi.state}
          />
        </div>
      ) : null}
    </>
  );
}
