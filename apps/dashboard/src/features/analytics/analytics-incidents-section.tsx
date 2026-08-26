"use client";

import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { StatusBadge } from "../../components/ui/status-badge";
import { useTranslation } from "../../i18n/locale-provider";
import {
  formatIncidentsPer1000Value,
  humanizeIncidentType,
} from "./analytics-display";
import type { AnalyticsComposition } from "./analytics-api";
import { AnalyticsMetric } from "./analytics-metric-cards";

/**
 * Incidents tab: backend incident facts for the selected period.
 *
 * Only contract fields render: incidentCount, severityCounts, typeCounts and
 * the backend-owned incidentsPer1000 (value string | null → honest em dash,
 * with numerator/denominator shown as context). No invented metrics exist
 * here beyond the contract surface.
 *
 * `type` is a free backend string, not a controlled enum, so it is
 * humanized exactly like the incidents monitoring surface (no invented
 * meaning); severity uses the typed shared enum labels.
 */

export function AnalyticsIncidentsSection({
  composition,
}: {
  composition: AnalyticsComposition;
}) {
  const { t } = useTranslation();
  const unavailable = t("analytics.value.unavailable");
  const incidents = composition.incidents;

  return (
    <div className="ana-section-stack">
      <div className="ana-two-column">
        <Card>
          <div className="card-section-header">
            <h2>{t("analytics.inc.incidentRateTitle")}</h2>
          </div>
          <div className="ana-metric-grid">
            <AnalyticsMetric
              label={t("analytics.inc.totalIncidents")}
              value={String(incidents.incidentCount)}
            />
            <AnalyticsMetric
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
          ) : null}
        </Card>
        <div className="ana-section-stack">
          <Card>
            <div className="card-section-header">
              <h2>{t("analytics.inc.severityTitle")}</h2>
            </div>
            {incidents.severityCounts.length === 0 ? (
              <EmptyState message={unavailable} />
            ) : (
              <ul className="ana-count-list">
                {incidents.severityCounts.map((entry) => (
                  <li className="ana-count-row" key={entry.severity}>
                    <StatusBadge
                      variant="incident-severity"
                      value={entry.severity}
                    />
                    <span className="ana-count-value">{entry.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <div className="card-section-header">
              <h2>{t("analytics.inc.typeTitle")}</h2>
            </div>
            {incidents.typeCounts.length === 0 ? (
              <EmptyState message={unavailable} />
            ) : (
              <ul className="ana-count-list">
                {incidents.typeCounts.map((entry) => (
                  <li className="ana-count-row" key={entry.type}>
                    <span className="ana-method-label">
                      {humanizeIncidentType(entry.type)}
                    </span>
                    <span className="ana-count-value">{entry.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
