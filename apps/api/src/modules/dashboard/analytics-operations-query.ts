import type {
  AnalyticsDurationMetric,
  OperationalAnalyticsResponse,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import type { AnalyticsPeriod } from "./analytics-period";
import {
  analyticsWindowCte,
  resolveAnalyticsTimezone,
} from "./analytics-period";

interface DurationRow {
  readonly checkInAvg: string | null;
  readonly checkInCount: number;
  readonly handoffAvg: string | null;
  readonly handoffCount: number;
  readonly parkingAvg: string | null;
  readonly parkingCount: number;
  readonly retrievalStartAuxAvg: string | null;
  readonly retrievalStartAuxCount: number;
  readonly retrievalWaitAvg: string | null;
  readonly retrievalWaitCount: number;
}

const durationPairs = [
  {
    averageAlias: "checkInAvg",
    countAlias: "checkInCount",
    end: "checking_in_completed_at",
    start: "created_at",
  },
  {
    averageAlias: "parkingAvg",
    countAlias: "parkingCount",
    end: "parked_at",
    start: "parking_started_at",
  },
  {
    averageAlias: "retrievalWaitAvg",
    countAlias: "retrievalWaitCount",
    end: "ready_at",
    start: "retrieval_requested_at",
  },
  {
    averageAlias: "retrievalStartAuxAvg",
    countAlias: "retrievalStartAuxCount",
    end: "retrieval_started_at",
    start: "retrieval_requested_at",
  },
  {
    averageAlias: "handoffAvg",
    countAlias: "handoffCount",
    end: "completed_at",
    start: "ready_at",
  },
] as const;

function metric(
  row: DurationRow,
  prefix: (typeof durationPairs)[number],
): AnalyticsDurationMetric {
  const average: string | null = row[prefix.averageAlias];
  return {
    averageSeconds: average,
    sampleCount: row[prefix.countAlias],
  };
}

function cohortPredicate(pair: (typeof durationPairs)[number]): string {
  const end = `s."${pair.end}"`;
  const start = `s."${pair.start}"`;
  return `${end} IS NOT NULL AND ${end} >= bounds.period_start AND ${end} < bounds.period_end AND ${end} >= ${start}`;
}

export async function operationalAnalytics(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    recordManagementActivity?: boolean;
    staffSessionContext?: StaffSessionContext;
    locationId: string;
    period: AnalyticsPeriod;
  },
): Promise<OperationalAnalyticsResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      capability: "ANALYTICS_READ",
      recordActivity: input.recordManagementActivity !== false,
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);
    const timezone = await resolveAnalyticsTimezone(transaction, scope);
    const parameters = [scope.organizationId, input.locationId];
    parameters.push(input.period.from, input.period.to, timezone);
    const windowCte = analyticsWindowCte(3, 4, 5);
    const selections = durationPairs
      .map((pair) => {
        const predicate = cohortPredicate(pair);
        return [
          `COUNT(*) FILTER (WHERE ${predicate})::int AS "${pair.countAlias}"`,
          `(AVG(EXTRACT(EPOCH FROM (s."${pair.end}" - s."${pair.start}"))) FILTER (WHERE ${predicate}))::numeric(20,3)::text AS "${pair.averageAlias}"`,
        ].join(",\n");
      })
      .join(",\n");
    const durations = await transaction.query<DurationRow>(
      `SELECT ${selections}
       FROM valet_sessions AS s
       ${windowCte}
       WHERE s.organization_id = $1 AND s.location_id = $2`,
      parameters,
    );
    const cars = await transaction.query<{ day: string; handled: number }>(
      `SELECT to_char(s.completed_at AT TIME ZONE $5, 'YYYY-MM-DD') AS day,
              count(*)::int AS handled
       FROM valet_sessions AS s
       ${windowCte}
       WHERE s.organization_id = $1 AND s.location_id = $2
         AND s.completed_at >= bounds.period_start
         AND s.completed_at < bounds.period_end
       GROUP BY 1 ORDER BY 1`,
      parameters,
    );
    const handledByDay = new Map(
      cars.rows.map((row) => [row.day, row.handled] as const),
    );
    const days: Array<{ date: string; handledCount: number }> = [];
    let cursor = Date.UTC(
      Number(input.period.from.slice(0, 4)),
      Number(input.period.from.slice(5, 7)) - 1,
      Number(input.period.from.slice(8, 10)),
    );
    const endMillis = Date.UTC(
      Number(input.period.to.slice(0, 4)),
      Number(input.period.to.slice(5, 7)) - 1,
      Number(input.period.to.slice(8, 10)),
    );
    while (cursor <= endMillis) {
      const date = new Date(cursor).toISOString().slice(0, 10);
      days.push({ date, handledCount: handledByDay.get(date) ?? 0 });
      cursor += 86_400_000;
    }
    const row = durations.rows[0];
    if (row === undefined) {
      throw new Error("Operational analytics aggregate is missing.");
    }
    return {
      carsHandledPerDay: days,
      from: input.period.from,
      locationId: scope.locationId,
      metrics: {
        checkInTime: metric(row, durationPairs[0]),
        handoffTime: metric(row, durationPairs[4]),
        parkingTime: metric(row, durationPairs[1]),
        retrievalStartLatencyAuxiliary: metric(row, durationPairs[3]),
        retrievalWait: metric(row, durationPairs[2]),
      },
      timezone,
      to: input.period.to,
    };
  });
}
