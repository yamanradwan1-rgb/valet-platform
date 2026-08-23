import type { IncidentAnalyticsResponse } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import type { AnalyticsPeriod } from "./analytics-period";
import {
  analyticsWindowSelect,
  resolveAnalyticsTimezone,
} from "./analytics-period";

interface IncidentCountRow {
  readonly denominator: number;
  readonly incidentCount: number;
}

interface GroupRow {
  readonly count: number;
  readonly key: string;
}

function per1000(numerator: number, denominator: number): string | null {
  if (denominator === 0) return null;
  const scaled = (BigInt(numerator) * 1_000_000n * 2n + BigInt(denominator)) /
    (BigInt(denominator) * 2n);
  return `${scaled / 1000n}.${(scaled % 1000n).toString().padStart(3, "0")}`;
}

export async function incidentAnalytics(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    locationId: string;
    period: AnalyticsPeriod;
  },
): Promise<IncidentAnalyticsResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    assertAuthorized(scope);
    const timezone = await resolveAnalyticsTimezone(transaction, scope);
    const parameters = [scope.organizationId, input.locationId];
    parameters.push(input.period.from, input.period.to, timezone);
    const counts = await transaction.query<IncidentCountRow>(
      `WITH w AS (${analyticsWindowSelect(3, 4, 5)}), completed AS (
         SELECT count(*)::int AS c
         FROM valet_sessions AS s CROSS JOIN w
         WHERE s.organization_id = $1 AND s.location_id = $2
           AND s.completed_at >= w.period_start
           AND s.completed_at < w.period_end
       )
       SELECT (SELECT c FROM completed) AS denominator,
              count(*)::int AS "incidentCount"
       FROM incidents AS i CROSS JOIN w
       WHERE i.organization_id = $1 AND i.location_id = $2
         AND i.created_at >= w.period_start
         AND i.created_at < w.period_end`,
      parameters,
    );
    const severities = await transaction.query<GroupRow>(
      `SELECT i.severity::text AS key, count(*)::int AS count
       FROM incidents AS i
       WHERE i.organization_id = $1 AND i.location_id = $2
         AND i.created_at >= ($3::date)::timestamp AT TIME ZONE $5
         AND i.created_at < (($4::date) + INTERVAL '1 day') AT TIME ZONE $5
       GROUP BY 1`,
      parameters,
    );
    const types = await transaction.query<GroupRow>(
      `SELECT i.type AS key, count(*)::int AS count
       FROM incidents AS i
       WHERE i.organization_id = $1 AND i.location_id = $2
         AND i.created_at >= ($3::date)::timestamp AT TIME ZONE $5
         AND i.created_at < (($4::date) + INTERVAL '1 day') AT TIME ZONE $5
       GROUP BY 1 ORDER BY 1`,
      parameters,
    );
    const row = counts.rows[0];
    if (row === undefined) {
      throw new Error("Incident analytics aggregate is missing.");
    }
    return {
      from: input.period.from,
      incidentCount: row.incidentCount,
      incidentsPer1000: {
        denominator: row.denominator,
        numerator: row.incidentCount,
        value: per1000(row.incidentCount, row.denominator),
      },
      locationId: scope.locationId,
      severityCounts: severities.rows
        .map((entry) => ({
          count: entry.count,
          severity: entry.key as IncidentAnalyticsResponse["severityCounts"][number]["severity"],
        }))
        .sort((left, right) => left.severity.localeCompare(right.severity)),
      timezone,
      to: input.period.to,
      typeCounts: types.rows.map((entry) => ({
        count: entry.count,
        type: entry.key,
      })),
    };
  });
}
