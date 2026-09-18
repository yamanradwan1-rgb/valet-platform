import type { CompanyAnalyticsSummary } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { companyLocationBoundsCte } from "./company-analytics-bounds";

interface IncidentRow {
  readonly incidentCount: number;
  readonly incidentsPer1000: CompanyAnalyticsSummary["incidents"]["incidentsPer1000"];
  readonly severityCounts: CompanyAnalyticsSummary["incidents"]["severityCounts"];
  readonly typeCounts: CompanyAnalyticsSummary["incidents"]["typeCounts"];
  readonly typeGroupCount: number;
}

export interface CompanyIncidentQueryResult {
  readonly data: CompanyAnalyticsSummary["incidents"];
  readonly typeGroupCount: number;
}

export async function queryCompanyIncidents(
  transaction: PostgresTransaction,
  parameters: readonly [string, string, string],
): Promise<CompanyIncidentQueryResult> {
  const result = await transaction.query<IncidentRow>(
    `WITH ${companyLocationBoundsCte()}, incident_rows AS (
       SELECT incident.severity::text AS severity, incident.type
       FROM incidents AS incident
       INNER JOIN location_bounds AS b ON b.location_id = incident.location_id
       WHERE incident.organization_id = $1
         AND incident.created_at >= b.period_start AND incident.created_at < b.period_end
     ), completed AS (
       SELECT count(*)::int AS count
       FROM valet_sessions AS session
       INNER JOIN location_bounds AS b ON b.location_id = session.location_id
       WHERE session.organization_id = $1
         AND session.completed_at >= b.period_start AND session.completed_at < b.period_end
     ), incident_summary AS (
       SELECT count(*)::int AS count FROM incident_rows
     ), severity_rows AS (
       SELECT severity, count(*)::int AS count
       FROM incident_rows GROUP BY severity
     ), type_rows AS (
       SELECT type, count(*)::int AS count
       FROM incident_rows GROUP BY type
     ), type_count AS (
       SELECT count(*)::int AS count FROM type_rows
     )
     SELECT incident_summary.count AS "incidentCount",
            type_count.count AS "typeGroupCount",
            jsonb_build_object(
              'numerator', incident_summary.count,
              'denominator', completed.count,
              'value', CASE WHEN completed.count = 0 THEN NULL
                ELSE (incident_summary.count::numeric * 1000 / completed.count::numeric)::numeric(20,3)::text END
            ) AS "incidentsPer1000",
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'severity', severity, 'count', count) ORDER BY severity) FROM severity_rows), '[]'::jsonb)
              AS "severityCounts",
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'type', type, 'count', count) ORDER BY type)
              FROM (SELECT * FROM type_rows ORDER BY type LIMIT 501) AS bounded), '[]'::jsonb)
              AS "typeCounts"
     FROM incident_summary CROSS JOIN completed CROSS JOIN type_count`,
    [...parameters],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Company incident analytics are missing.");
  return {
    data: {
      incidentCount: row.incidentCount,
      incidentsPer1000: row.incidentsPer1000,
      severityCounts: row.severityCounts,
      typeCounts: row.typeCounts,
    },
    typeGroupCount: row.typeGroupCount,
  };
}
