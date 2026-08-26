"use client";

import type { DailyActivity } from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import {
  reportDispatchEventLabelKey,
  reportKeyCustodyEventLabelKey,
  taskTypeLabelKey,
} from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";

/**
 * DAILY-ONLY activity section (D4-002).
 *
 * Renders the exact dailyActivity contract surface — retrievalRequestedCount,
 * dispatch event counts per (taskType, eventType) and key custody event
 * counts — through typed enum label mappings, so raw backend codes never
 * reach the UI. Zero counts are real data; empty arrays get honest empty
 * states; no durations or state transitions are invented. This section is
 * rendered ONLY for DAILY responses that actually carry dailyActivity.
 */
export function ReportsDailyActivitySection({
  activity,
}: {
  activity: DailyActivity;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="card-section-header">
        <h2>{t("reports.activity.title")}</h2>
        <p className="rep-hint">{t("reports.activity.note")}</p>
      </div>

      <div className="rep-metric-grid">
        <div className="rep-metric">
          <p className="rep-metric-label">
            {t("reports.activity.retrievalRequested")}
          </p>
          <p className="rep-metric-value is-emphasized">
            {activity.retrievalRequestedCount}
          </p>
        </div>
      </div>

      <div className="rep-count-columns rep-subcolumns">
        <div>
          <h3 className="rep-count-title">
            {t("reports.activity.dispatchTitle")}
          </h3>
          {activity.dispatchEventCounts.length === 0 ? (
            <EmptyState message={t("analytics.value.unavailable")} />
          ) : (
            <table className="rep-event-table">
              <caption className="rep-table-caption">
                {t("reports.activity.dispatchTitle")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t("reports.table.eventColumn")}</th>
                  <th scope="col" className="rep-number-col">
                    {t("reports.table.countColumn")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {activity.dispatchEventCounts.map((entry) => (
                  <tr key={`${entry.taskType}-${entry.eventType}`}>
                    <th scope="row" className="rep-event-cell">
                      {`${t(taskTypeLabelKey(entry.taskType))} · ${t(reportDispatchEventLabelKey(entry.eventType))}`}
                    </th>
                    <td className="rep-count-value rep-number-col">
                      {entry.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h3 className="rep-count-title">
            {t("reports.activity.keyCustodyTitle")}
          </h3>
          {activity.keyCustodyEventCounts.length === 0 ? (
            <EmptyState message={t("analytics.value.unavailable")} />
          ) : (
            <table className="rep-event-table">
              <caption className="rep-table-caption">
                {t("reports.activity.keyCustodyTitle")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t("reports.table.eventColumn")}</th>
                  <th scope="col" className="rep-number-col">
                    {t("reports.table.countColumn")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {activity.keyCustodyEventCounts.map((entry) => (
                  <tr key={entry.eventType}>
                    <th scope="row" className="rep-event-cell">
                      {t(reportKeyCustodyEventLabelKey(entry.eventType))}
                    </th>
                    <td className="rep-count-value rep-number-col">
                      {entry.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Card>
  );
}
