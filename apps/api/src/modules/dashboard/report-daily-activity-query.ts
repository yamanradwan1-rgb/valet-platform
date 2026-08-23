import type { DailyActivity } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import type { AnalyticsPeriod } from "./analytics-period";
import { analyticsWindowCte } from "./analytics-period";

interface CountRow {
  readonly count: number;
}

interface DispatchGroupRow {
  readonly count: number;
  readonly eventType: string;
  readonly taskType: string;
}

interface CustodyGroupRow {
  readonly count: number;
  readonly eventType: string;
}

export async function dailyReportActivity(
  pool: PostgresPool,
  scope: { locationId: string; organizationId: string },
  period: AnalyticsPeriod,
  timezone: string,
): Promise<DailyActivity> {
  const client = await pool.connect();
  try {
    const parameters = [
      scope.organizationId,
      scope.locationId,
      period.from,
      period.to,
      timezone,
    ];
    const windowCte = analyticsWindowCte(3, 4, 5);
    const retrieval = await client.query<CountRow>(
      `SELECT count(*)::int AS count
       FROM retrieval_requests AS request
       INNER JOIN valet_sessions AS session
         ON session.organization_id = request.organization_id
        AND session.id = request.valet_session_id
       ${windowCte}
       WHERE request.organization_id = $1
         AND session.location_id = $2
         AND request.requested_at >= bounds.period_start
         AND request.requested_at < bounds.period_end`,
      parameters,
    );
    const dispatchGroups = await client.query<DispatchGroupRow>(
      `SELECT task.task_type::text AS "taskType",
              event.event_type::text AS "eventType",
              count(*)::int AS count
       FROM dispatch_events AS event
       INNER JOIN tasks AS task
         ON task.organization_id = event.organization_id
        AND task.location_id = event.location_id
        AND task.id = event.task_id
       ${windowCte}
       WHERE event.organization_id = $1
         AND event.location_id = $2
         AND event.occurred_at >= bounds.period_start
         AND event.occurred_at < bounds.period_end
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      parameters,
    );
    const custodyGroups = await client.query<CustodyGroupRow>(
      `SELECT custody.event_type::text AS "eventType",
              count(*)::int AS count
       FROM key_custody_events AS custody
       ${windowCte}
       WHERE custody.organization_id = $1
         AND custody.location_id = $2
         AND custody.occurred_at >= bounds.period_start
         AND custody.occurred_at < bounds.period_end
       GROUP BY 1
       ORDER BY 1`,
      parameters,
    );
    return {
      dispatchEventCounts: dispatchGroups.rows.map((row) => ({
        count: row.count,
        eventType: row.eventType as DailyActivity["dispatchEventCounts"][number]["eventType"],
        taskType: row.taskType as DailyActivity["dispatchEventCounts"][number]["taskType"],
      })),
      keyCustodyEventCounts: custodyGroups.rows.map((row) => ({
        count: row.count,
        eventType: row.eventType as DailyActivity["keyCustodyEventCounts"][number]["eventType"],
      })),
      retrievalRequestedCount: retrieval.rows[0]?.count ?? 0,
    };
  } finally {
    client.release();
  }
}
