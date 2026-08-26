"use client";

import type { ReportSummary } from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { StatusBadge } from "../../components/ui/status-badge";
import { useTranslation } from "../../i18n/locale-provider";

import {
  formatIncidentsPer1000Value,
  humanizeIncidentType,
} from "./reports-display";
import { ReportMetric } from "./reports-metric-cards";

/**
 * Incident summary section of a loaded report.
 *
 * `type` is a free backend string (not a controlled enum), so it is
 * humanized losslessly exactly like the incidents/analytics surfaces —
 * casing never changes and no taxonomy is invented. Severity uses the
 * typed shared enum badges; incidentsPer1000 renders the backend value
 * verbatim with its numerator/denominator context, null stays em dash.
 */
export function ReportsIncidentsSection({
  summary,
}: {
  summary: ReportSummary;
}) {
  const { t } = useTranslation();
  const unavailable = t("analytics.value.unavailable");
  const incidents = summary.incidents;

  return (
    <Card>
      <div className="card-section-header">
        <h2>{t("reports.summary.incidentsTitle")}</h2>
      </div>
      <div className="rep-metric-grid">
        <ReportMetric
          label={t("analytics.inc.totalIncidents")}
          value={String(incidents.incidentCount)}
        />
        <ReportMetric
          label={t("analytics.inc.per1000")}
          sub={`${incidents.incidentsPer1000.numerator} / ${incidents.incidentsPer1000.denominator}`}
          value={formatIncidentsPer1000Value(
            incidents.incidentsPer1000.value,
            unavailable,
          )}
        />
      </div>

      {incidents.incidentCount === 0 ? (
        <EmptyState message={t("analytics.inc.empty")} />
      ) : (
        <div className="rep-count-columns">
          <div>
            <h3 className="rep-count-title">
              {t("analytics.inc.severityTitle")}
            </h3>
            {incidents.severityCounts.length === 0 ? (
              <p className="rep-hint">{unavailable}</p>
            ) : (
              <ul className="rep-count-list">
                {incidents.severityCounts.map((entry) => (
                  <li className="rep-count-row" key={entry.severity}>
                    <StatusBadge
                      variant="incident-severity"
                      value={entry.severity}
                    />
                    <span className="rep-count-value">{entry.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="rep-count-title">
              {t("analytics.inc.typeTitle")}
            </h3>
            {incidents.typeCounts.length === 0 ? (
              <p className="rep-hint">{unavailable}</p>
            ) : (
              <ul className="rep-count-list">
                {incidents.typeCounts.map((entry) => (
                  <li className="rep-count-row" key={entry.type}>
                    <span className="rep-method-label">
                      {humanizeIncidentType(entry.type)}
                    </span>
                    <span className="rep-count-value">{entry.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
