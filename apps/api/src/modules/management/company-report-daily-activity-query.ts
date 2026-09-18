import type { CompanyDailyReportResponse } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { companyLocationBoundsCte } from "./company-analytics-bounds";

type CompanyDailyActivity = CompanyDailyReportResponse["dailyActivity"];

interface DailyActivityRow {
  readonly custodyGroupCount: number;
  readonly dispatchEventCounts: CompanyDailyActivity["dispatchEventCounts"];
  readonly dispatchGroupCount: number;
  readonly keyCustodyEventCounts: CompanyDailyActivity["keyCustodyEventCounts"];
  readonly retrievalRequestedCount: number;
}

export interface CompanyDailyActivityQueryResult {
  readonly custodyGroupCount: number;
  readonly data: CompanyDailyActivity;
  readonly dispatchGroupCount: number;
}

export async function queryCompanyDailyActivity(
  transaction: PostgresTransaction,
  input: {
    readonly from: string;
    readonly organizationId: string;
    readonly to: string;
  },
): Promise<CompanyDailyActivityQueryResult> {
  const result = await transaction.query<DailyActivityRow>(
    `WITH ${companyLocationBoundsCte()}, retrieval AS (
       SELECT count(*)::int AS count
       FROM retrieval_requests AS request
       INNER JOIN valet_sessions AS session
         ON session.organization_id = request.organization_id
        AND session.id = request.valet_session_id
       INNER JOIN location_bounds AS b ON b.location_id = session.location_id
       WHERE request.organization_id = $1
         AND request.requested_at >= b.period_start
         AND request.requested_at < b.period_end
     ), dispatch_rows AS (
       SELECT task.task_type::text AS task_type,
              event.event_type::text AS event_type,
              count(*)::int AS count
       FROM dispatch_events AS event
       INNER JOIN tasks AS task
         ON task.organization_id = event.organization_id
        AND task.location_id = event.location_id
        AND task.id = event.task_id
       INNER JOIN location_bounds AS b ON b.location_id = event.location_id
       WHERE event.organization_id = $1
         AND event.occurred_at >= b.period_start
         AND event.occurred_at < b.period_end
       GROUP BY task.task_type, event.event_type
     ), custody_rows AS (
       SELECT custody.event_type::text AS event_type, count(*)::int AS count
       FROM key_custody_events AS custody
       INNER JOIN location_bounds AS b ON b.location_id = custody.location_id
       WHERE custody.organization_id = $1
         AND custody.occurred_at >= b.period_start
         AND custody.occurred_at < b.period_end
       GROUP BY custody.event_type
     )
     SELECT retrieval.count AS "retrievalRequestedCount",
            (SELECT count(*)::int FROM dispatch_rows) AS "dispatchGroupCount",
            (SELECT count(*)::int FROM custody_rows) AS "custodyGroupCount",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'taskType', task_type, 'eventType', event_type, 'count', count
              ) ORDER BY task_type, event_type)
              FROM (SELECT * FROM dispatch_rows ORDER BY task_type, event_type LIMIT 17) AS bounded
            ), '[]'::jsonb) AS "dispatchEventCounts",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'eventType', event_type, 'count', count
              ) ORDER BY event_type)
              FROM (SELECT * FROM custody_rows ORDER BY event_type LIMIT 6) AS bounded
            ), '[]'::jsonb) AS "keyCustodyEventCounts"
     FROM retrieval`,
    [input.organizationId, input.from, input.to],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Company daily activity is missing.");
  return {
    custodyGroupCount: row.custodyGroupCount,
    data: {
      dispatchEventCounts: row.dispatchEventCounts,
      keyCustodyEventCounts: row.keyCustodyEventCounts,
      retrievalRequestedCount: row.retrievalRequestedCount,
    },
    dispatchGroupCount: row.dispatchGroupCount,
  };
}
