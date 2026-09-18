import type { CompanyAnalyticsSummary } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { companyLocationBoundsCte } from "./company-analytics-bounds";

interface CoverageRow {
  readonly boundaryActiveLocationCount: number | null;
  readonly boundaryInactiveLocationCount: number | null;
  readonly locationCount: number | null;
  readonly periodEndUtc: string | null;
  readonly periodStartUtc: string | null;
  readonly timezone: string | null;
  readonly timezoneGroupCount: number;
  readonly totalActiveLocationCount: number;
  readonly totalInactiveLocationCount: number;
  readonly totalLocationCount: number;
}

export interface CompanyCoverageQueryResult {
  readonly data: CompanyAnalyticsSummary["coverage"];
  readonly timezoneGroupCount: number;
}

export async function queryCompanyCoverage(
  transaction: PostgresTransaction,
  parameters: readonly [string, string, string],
): Promise<CompanyCoverageQueryResult> {
  const result = await transaction.query<CoverageRow>(
    `WITH ${companyLocationBoundsCte()},
     timezone_groups AS (
       SELECT timezone,
              count(*)::int AS "locationCount",
              count(*) FILTER (WHERE status = 'ACTIVE')::int AS "activeLocationCount",
              count(*) FILTER (WHERE status = 'INACTIVE')::int AS "inactiveLocationCount",
              to_char(period_start AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "periodStartUtc",
              to_char(period_end AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "periodEndUtc"
       FROM location_bounds
       GROUP BY timezone, period_start, period_end
     ), summary AS (
       SELECT count(*)::int AS "totalLocationCount",
              count(*) FILTER (WHERE status = 'ACTIVE')::int AS "activeLocationCount",
              count(*) FILTER (WHERE status = 'INACTIVE')::int AS "inactiveLocationCount"
       FROM location_bounds
     ), group_count AS (
       SELECT count(*)::int AS "timezoneGroupCount" FROM timezone_groups
     ), bounded_groups AS (
       SELECT * FROM timezone_groups ORDER BY timezone LIMIT 501
     )
     SELECT summary."totalLocationCount",
            summary."activeLocationCount" AS "totalActiveLocationCount",
            summary."inactiveLocationCount" AS "totalInactiveLocationCount",
            group_count."timezoneGroupCount",
            groups.timezone, groups."locationCount", groups."periodStartUtc",
            groups."periodEndUtc",
            groups."activeLocationCount" AS "boundaryActiveLocationCount",
            groups."inactiveLocationCount" AS "boundaryInactiveLocationCount"
     FROM summary CROSS JOIN group_count
     LEFT JOIN bounded_groups AS groups ON true
     ORDER BY groups.timezone NULLS LAST`,
    [...parameters],
  );
  const first = result.rows[0];
  if (first === undefined) throw new Error("Company analytics coverage is missing.");
  return {
    data: {
      activeLocationCount: first.totalActiveLocationCount,
      inactiveLocationCount: first.totalInactiveLocationCount,
      timezoneBoundaries: result.rows
        .filter((row) => row.timezone !== null)
        .map((row) => ({
          activeLocationCount: row.boundaryActiveLocationCount!,
          inactiveLocationCount: row.boundaryInactiveLocationCount!,
          locationCount: row.locationCount!,
          periodEndUtc: row.periodEndUtc!,
          periodStartUtc: row.periodStartUtc!,
          timezone: row.timezone!,
        })),
      totalLocationCount: first.totalLocationCount,
    },
    timezoneGroupCount: first.timezoneGroupCount,
  };
}
