"use client";

import type { AnalyticsRate } from "@valet/contracts";

import { useTranslation } from "../../i18n/locale-provider";

/**
 * Presentational metric building blocks for the Reports summary.
 *
 * Feature-local clones of the analytics blocks (no cross-feature state or
 * styling coupling). Values render exactly what the backend reported:
 * percentages and money strings are verbatim, null renders the localized
 * em dash, and numerator/denominator facts stay visible next to every
 * backend rate.
 */

export function ReportMetric({
  label,
  value,
  sub,
  emphasized = false,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  emphasized?: boolean | undefined;
}) {
  return (
    <div className="rep-metric">
      <p className="rep-metric-label">{label}</p>
      <p className={`rep-metric-value${emphasized ? " is-emphasized" : ""}`}>
        {value}
      </p>
      {sub !== undefined && <p className="rep-metric-sub">{sub}</p>}
    </div>
  );
}

export function ReportMetricSkeleton() {
  return (
    <div className="rep-metric" aria-hidden="true">
      <p className="rep-metric-label">&nbsp;</p>
      <span className="skeleton-line" />
    </div>
  );
}

export function ReportRateCard({
  label,
  rate,
  extra,
}: {
  label: string;
  rate: AnalyticsRate;
  extra?: string | undefined;
}) {
  const { t } = useTranslation();
  const unavailable = t("analytics.value.unavailable");
  // Backend-owned formula: percentage string renders verbatim, null stays
  // honestly unavailable, and the raw ratio stays visible for context.
  const value =
    rate.percentage === null ? unavailable : `${rate.percentage}%`;
  return (
    <div className="rep-rate-card">
      <p className="rep-rate-label">{label}</p>
      <p className="rep-rate-value">{value}</p>
      <p className="rep-rate-sub">
        {`${rate.numerator} / ${rate.denominator}`}
      </p>
      {extra !== undefined && <p className="rep-rate-extra">{extra}</p>}
    </div>
  );
}
