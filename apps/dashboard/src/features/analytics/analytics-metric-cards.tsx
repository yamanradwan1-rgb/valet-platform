"use client";

import type { AnalyticsRate } from "@valet/contracts";

import { useTranslation } from "../../i18n/locale-provider";
import {
  formatRatePercentage,
  formatRateRatio,
} from "./analytics-display";

/**
 * Presentational metric building blocks for the Analytics tabs.
 *
 * Values render exactly what the backend reported: percentages and money
 * strings are verbatim, null renders the localized em dash, and
 * numerator/denominator facts stay visible next to every backend rate.
 */

export function AnalyticsMetric({
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
    <div className="ana-metric">
      <p className="ana-metric-label">{label}</p>
      <p className={`ana-metric-value${emphasized ? " is-emphasized" : ""}`}>
        {value}
      </p>
      {sub !== undefined && <p className="ana-metric-sub">{sub}</p>}
    </div>
  );
}

export function AnalyticsMetricSkeleton() {
  return (
    <div className="ana-metric" aria-hidden="true">
      <p className="ana-metric-label">&nbsp;</p>
      <span className="skeleton-line" />
    </div>
  );
}

export function AnalyticsRateCard({
  label,
  rate,
  extra,
}: {
  label: string;
  rate: AnalyticsRate;
  extra?: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div className="ana-rate-card">
      <p className="ana-rate-label">{label}</p>
      <p className="ana-rate-value">
        {formatRatePercentage(rate, t("analytics.value.unavailable"))}
      </p>
      <p className="ana-rate-sub">{formatRateRatio(rate)}</p>
      {extra !== undefined && <p className="ana-rate-extra">{extra}</p>}
    </div>
  );
}
