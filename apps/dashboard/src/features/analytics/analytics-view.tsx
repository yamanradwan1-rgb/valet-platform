"use client";

import { useMemo, useState } from "react";

import "./analytics.css";

import { Card } from "../../components/ui/card";
import { ErrorState } from "../../components/ui/empty-state";
import { FullscreenLoader, Skeleton } from "../../components/ui/skeleton";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";
import { DashboardApiError } from "../../lib/api/api-error";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import {
  defaultAnalyticsPeriod,
  inclusiveDayCount,
  validateAnalyticsPeriodInput,
  type AnalyticsPeriodErrorKind,
} from "./analytics-period";
import { AnalyticsFinancialSection } from "./analytics-financial-section";
import { AnalyticsIncidentsSection } from "./analytics-incidents-section";
import {
  AnalyticsMetricSkeleton,
} from "./analytics-metric-cards";
import { AnalyticsOperationsSection } from "./analytics-operations-section";
import { useAnalyticsData } from "./use-analytics-data";

/**
 * D4-001 — Analytics page body.
 *
 * Period UX mirrors the backend contract (local dates, from <= to, ≤31
 * inclusive days) but the backend stays authoritative. The workspace is
 * keyed by location id, so an A→B location switch remounts it: period drafts
 * reset to the new location's local defaults and every old snapshot is gone
 * before the first B request leaves. Data loading itself goes through the
 * race-safe (location, period)-identity loader.
 */

type AnalyticsTab = "operations" | "financial" | "incidents";

const TAB_LABEL_KEYS: Record<AnalyticsTab, TranslationKey> = {
  financial: "analytics.tab.financial",
  incidents: "analytics.tab.incidents",
  operations: "analytics.tab.operations",
};

/** Exported for error-semantics tests; raw backend codes stay diagnostic. */
export function errorMessageKey(error: DashboardApiError): TranslationKey {
  if (error.kind === "authorization-masked" || error.kind === "forbidden") {
    return "analytics.error.accessDenied";
  }
  if (error.isNetworkError) return "analytics.error.network";
  return "analytics.error.loadFailed";
}

export function canRetry(error: DashboardApiError): boolean {
  return (
    error.kind !== "authorization-masked" &&
    error.kind !== "forbidden" &&
    error.kind !== "session-expired"
  );
}

function periodErrorMessage(kind: AnalyticsPeriodErrorKind): TranslationKey {
  if (kind === "format") return "analytics.period.errorFormat";
  if (kind === "order") return "analytics.period.errorOrder";
  return "analytics.period.errorRange";
}

export function AnalyticsView() {
  const { t } = useTranslation();
  const location = useDashboardLocation();

  if (location === null) {
    return <p className="foundation-note">{t("placeholder.locationMissingNote")}</p>;
  }

  // Remounting per location resets period drafts to that location's local
  // defaults and guarantees zero stale snapshots across A→B switches.
  return (
    <AnalyticsWorkspace
      key={location.locationId}
      locationId={location.locationId}
      timezone={location.timezone}
    />
  );
}

function AnalyticsWorkspace({
  locationId,
  timezone,
}: {
  locationId: string;
  timezone: string;
}) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [tab, setTab] = useState<AnalyticsTab>("operations");
  const defaults = useMemo(
    () => defaultAnalyticsPeriod(timezone),
    [timezone],
  );
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState(defaults);

  const draftError = validateAnalyticsPeriodInput(draft.from, draft.to);
  const unchanged =
    draft.from === applied.from && draft.to === applied.to;
  const { snapshot, retry } = useAnalyticsData(client, {
    from: applied.from,
    locationId,
    to: applied.to,
  });

  const applyDisabled = draftError !== null || unchanged;
  const dayCount = inclusiveDayCount(applied.from, applied.to);

  return (
    <>
      <p className="ana-note">{t("analytics.infoNote")}</p>

      <Card className="ana-period-card">
        <div className="ana-period-fields">
          <label className="ana-date-field">
            <span>{t("analytics.period.from")}</span>
            <input
              type="date"
              value={draft.from}
              max={defaults.to}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </label>
          <label className="ana-date-field">
            <span>{t("analytics.period.to")}</span>
            <input
              type="date"
              value={draft.to}
              max={defaults.to}
              onChange={(event) =>
                setDraft((current) => ({ ...current, to: event.target.value }))
              }
            />
          </label>
          <button
            type="button"
            className="btn-secondary ana-apply-button"
            disabled={applyDisabled}
            onClick={() => setApplied({ ...draft })}
          >
            {t("analytics.period.apply")}
          </button>
        </div>
        <div className="ana-period-meta">
          <p className="ana-hint">{t("analytics.period.hint")}</p>
          <p className="ana-hint">
            {`${t("analytics.period.locationTimezoneLabel")} · ${timezone}`}
          </p>
          <p className="ana-hint">
            {`${t("analytics.period.appliedDays")}: ${dayCount}`}
          </p>
          {draftError !== null ? (
            <p className="ana-error" role="alert">
              {t(periodErrorMessage(draftError))}
            </p>
          ) : null}
        </div>
      </Card>

      {snapshot.phase === "ready" ? (
        <p className="ana-envelope">
          {`${t("analytics.period.reportedLabel")}: ${snapshot.data.operations.from} → ${snapshot.data.operations.to} · ${snapshot.data.operations.timezone}`}
        </p>
      ) : null}

      <div className="ana-tabs" role="tablist">
        {(Object.keys(TAB_LABEL_KEYS) as AnalyticsTab[]).map((key) => (
          <button
            aria-selected={tab === key}
            className={`ana-tab${tab === key ? " is-active" : ""}`}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            {t(TAB_LABEL_KEYS[key])}
          </button>
        ))}
      </div>

      {snapshot.phase === "error" &&
      snapshot.error.kind === "session-expired" ? (
        <FullscreenLoader label={t("session.restoring")} />
      ) : null}

      {snapshot.phase === "error" &&
      snapshot.error.kind !== "session-expired" ? (
        <ErrorState
          message={t(errorMessageKey(snapshot.error))}
          onRetry={canRetry(snapshot.error) ? retry : undefined}
          retryLabel={
            canRetry(snapshot.error) ? t("analytics.action.retry") : undefined
          }
        />
      ) : null}

      {snapshot.phase === "loading" || snapshot.phase === "idle" ? (
        <div className="ana-section-stack" aria-live="polite">
          <div className="ana-metric-grid ana-metric-grid-5">
            {[0, 1, 2, 3, 4].map((key) => (
              <AnalyticsMetricSkeleton key={key} />
            ))}
          </div>
          <Card>
            <Skeleton label={t("analytics.loading")} lines={6} />
          </Card>
        </div>
      ) : null}

      {snapshot.phase === "ready" ? (
        <>
          {tab === "operations" ? (
            <AnalyticsOperationsSection composition={snapshot.data} />
          ) : null}
          {tab === "financial" ? (
            <AnalyticsFinancialSection composition={snapshot.data} />
          ) : null}
          {tab === "incidents" ? (
            <AnalyticsIncidentsSection composition={snapshot.data} />
          ) : null}
        </>
      ) : null}
    </>
  );
}
