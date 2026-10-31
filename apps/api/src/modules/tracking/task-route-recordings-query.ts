import { UnauthorizedException } from "@nestjs/common";
import type {
  TaskRouteRecordingsQuery,
  TaskRouteRecordingsResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { authorizeTaskRouteHistory } from "./task-route-authorization";
import {
  decodeTaskRouteCursor,
  encodeTaskRouteCursor,
} from "./task-route-cursor";

class TaskRouteUnavailableError extends Error {
  readonly code = "AUTHORIZATION_DENIED";
}

export function createTaskRouteRecordingsQuery(pool: PostgresPool) {
  return (
    input: TaskRouteRecordingsQuery & {
      readonly taskId: string;
      readonly staffSessionContext: StaffSessionContext;
    },
  ): Promise<TaskRouteRecordingsResponse> =>
    inPostgresTransaction(pool, async (transaction) => {
      if (
        !(await lockAndRecheckStaffSessionContext(
          transaction,
          input.staffSessionContext,
        ))
      ) {
        throw new UnauthorizedException();
      }
      const scope = await authorizeTaskRouteHistory(
        transaction,
        input.staffSessionContext.userId,
        input.taskId,
      );
      if (scope === null) throw new TaskRouteUnavailableError();
      const cursor = decodeTaskRouteCursor(input.cursor, input.taskId);
      const result = await transaction.query<{
        id: string;
        started_at: Date;
        ended_at: Date;
        assignee_membership_id: string | null;
      }>(
        `SELECT id, started_at, ended_at, assignee_membership_id
       FROM task_tracking_sessions
       WHERE organization_id = $1 AND location_id = $2
         AND valet_session_id = $3 AND task_id = $4 AND ended_at IS NOT NULL
         AND ($5::timestamptz IS NULL OR (started_at, id) > ($5::timestamptz, $6::uuid))
       ORDER BY started_at, id LIMIT $7`,
        [
          scope.organization_id,
          scope.location_id,
          scope.valet_session_id,
          input.taskId,
          cursor?.startedAt ?? null,
          cursor?.id ?? null,
          input.limit + 1,
        ],
      );
      const rows = result.rows.slice(0, input.limit);
      const last = rows.at(-1);
      return {
        recordings: rows.map((row) => ({
          trackingSessionId: row.id,
          startedAt: row.started_at.toISOString(),
          endedAt: row.ended_at.toISOString(),
          assigneeMembershipId: row.assignee_membership_id,
        })),
        nextCursor:
          result.rows.length > input.limit && last
            ? encodeTaskRouteCursor({
                taskId: input.taskId,
                id: last.id,
                startedAt: last.started_at.toISOString(),
              })
            : null,
      };
    });
}
