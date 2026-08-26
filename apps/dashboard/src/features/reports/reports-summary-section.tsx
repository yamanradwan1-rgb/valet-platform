"use client";

import type { ReportSummary } from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";

import {
  formatReportDuration,
  handledBarPercent,
  maxHandledCount,
} from "./reports-display";
import { ReportMetric } from "./reports-metric-cards";

/**
 * Operational summary section of a loaded report: the five backend
 * duration metrics and the cars-handled-per-day series. Only contract
 * fields render; null averages show the honest em dash, zero days are real
 * data, and empty series get an explicit empty state.
 */

const DURATION_METRIC_KEYS: readonly {
  readonly key: TranslationKey;
  readonly label: "checkInTime" | "handoffTime" | "parkingTime" | "retrievalStartLatencyAuxiliary" | "retrievalWait";
}[] = [
  { key: "analytics.ops.checkInTime", label: "checkInTime" },
  { key: "analytics.ops.parkingTime", label: "parkingTime" },
  { key: "analytics.ops.retrievalWait", label: "retrievalWait" },
  {
    key: "analytics.ops.retrievalStartLatencyAuxiliary",
    label: "retrievalStartLatencyAuxiliary",
  },
  { key: "analytics.ops.handoffTime", label: "handoffTime" },
];

export function ReportsSummarySection({
  summary,
}: {
  summary: ReportSummary;
}) {
  const { t } = useTranslation();
  const unavailable = t("analytics.value.unavailable");
  const maxHandled = maxHandledCount(summary.carsHandledPerDay);

  return (
    <Card>
      <div className="card-section-header">
        <h2>{t("reports.summary.operationalTitle")}</h2>
      </div>
      <div className="rep-metric-grid">
        {DURATION_METRIC_KEYS.map((metric) => (
          <ReportMetric
            key={metric.label}
            label={t(metric.key)}
            sub={`${t("analytics.ops.samplesCount")}: ${summary.metrics[metric.label].sampleCount}`}
            value={formatReportDuration(
              summary.metrics[metric.label],
              unavailable,
            )}
          />
        ))}
      </div>

      <div className="card-section-header rep-subheader">
        <h3>{t("analytics.ops.carsHandledTitle")}</h3>
      </div>
      {summary.carsHandledPerDay.length === 0 ? (
        <EmptyState message={t("analytics.ops.carsEmpty")} />
      ) : (
        <ul className="rep-bar-list">
          {summary.carsHandledPerDay.map((entry) => (
            <li className="rep-bar-row" key={entry.date}>
              <span className="rep-bar-date">{entry.date}</span>
              <span className="rep-bar-track">
                <span
                  className="rep-bar-fill"
                  style={{
                    inlineSize: `${handledBarPercent(entry.handledCount, maxHandled)}%`,
                  }}
                />
              </span>
              <span className="rep-bar-count">{entry.handledCount}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
