"use client";

import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { useTranslation } from "../../i18n/locale-provider";
import {
  formatDurationAverage,
  formatQueueAgeSeconds,
  formatSampleCount,
  handledBarPercent,
  maxHandledCount,
} from "./analytics-display";
import type { AnalyticsComposition } from "./analytics-api";
import { AnalyticsMetric } from "./analytics-metric-cards";

/**
 * Operations tab: backend duration metrics, the cars-handled-per-local-day
 * series and the current retrieval queue snapshot.
 *
 * Duration averages render VERBATIM (backend string seconds + sample count;
 * null → em dash). Bars scale only to the max of their own series — a purely
 * presentational derivation. Queue facts are depth and oldestAgeSeconds
 * (string | null), rendered as a live snapshot only; no wait-position
 * ordering, arrival estimate or compliance semantics is derived anywhere.
 */

export function AnalyticsOperationsSection({
  composition,
}: {
  composition: AnalyticsComposition;
}) {
  const { t } = useTranslation();
  const unavailable = t("analytics.value.unavailable");
  const ageUnits = {
    minutes: t("analytics.duration.minutesUnit"),
    seconds: t("analytics.duration.secondsUnit"),
  };
  const metrics = composition.operations.metrics;
  const durationEntries = [
    {
      key: "checkInTime",
      label: t("analytics.ops.checkInTime"),
      metric: metrics.checkInTime,
    },
    {
      key: "parkingTime",
      label: t("analytics.ops.parkingTime"),
      metric: metrics.parkingTime,
    },
    {
      key: "retrievalWait",
      label: t("analytics.ops.retrievalWait"),
      metric: metrics.retrievalWait,
    },
    {
      key: "retrievalStartLatencyAuxiliary",
      label: t("analytics.ops.retrievalStartLatencyAuxiliary"),
      metric: metrics.retrievalStartLatencyAuxiliary,
    },
    {
      key: "handoffTime",
      label: t("analytics.ops.handoffTime"),
      metric: metrics.handoffTime,
    },
  ] as const;
  const cars = composition.operations.carsHandledPerDay;
  const maxCount = maxHandledCount(cars);

  return (
    <div className="ana-section-stack">
      <div className="ana-metric-grid ana-metric-grid-5">
        {durationEntries.map((entry) => (
          <AnalyticsMetric
            key={entry.key}
            label={entry.label}
            sub={`${t("analytics.ops.samplesCount")}: ${formatSampleCount(entry.metric.sampleCount)}`}
            value={formatDurationAverage(entry.metric, unavailable)}
          />
        ))}
      </div>
      <div className="ana-two-column">
        <Card>
          <div className="card-section-header">
            <h2>{t("analytics.ops.carsHandledTitle")}</h2>
          </div>
          {cars.length === 0 ? (
            <EmptyState message={t("analytics.ops.carsEmpty")} />
          ) : (
            <ul className="ana-bar-list">
              {cars.map((entry) => (
                <li className="ana-bar-row" key={entry.date}>
                  <span className="ana-bar-date">{entry.date}</span>
                  <span className="ana-bar-track">
                    <span
                      className="ana-bar-fill"
                      style={{
                        inlineSize: `${handledBarPercent(entry.handledCount, maxCount)}%`,
                      }}
                    />
                  </span>
                  <span className="ana-bar-count">{entry.handledCount}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="card-section-header">
            <h2>{t("analytics.ops.queueTitle")}</h2>
          </div>
          <div className="ana-metric-grid">
            <AnalyticsMetric
              label={t("analytics.queue.depth")}
              value={String(composition.queue.depth)}
            />
            <AnalyticsMetric
              label={t("analytics.queue.oldestWait")}
              value={formatQueueAgeSeconds(
                composition.queue.oldestAgeSeconds,
                unavailable,
                ageUnits,
              )}
            />
          </div>
          <p className="ana-note">{t("analytics.queue.snapshotNote")}</p>
        </Card>
      </div>
    </div>
  );
}
