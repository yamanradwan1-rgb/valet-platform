import type { RetrievalQueueEntry, TaskOverviewEntry } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import {
  operationalAssigneeColumn,
  operationalAssigneeJoins,
} from "./operational-assignee-projection";
import { createOverviewCursorCodec } from "./overview-cursor";

const queueCursorCodec = createOverviewCursorCodec("retrieval-queue");
const taskCursorCodec = createOverviewCursorCodec("tasks");

interface QueueRow {
  readonly assignee: NonNullable<RetrievalQueueEntry["task"]>["assignee"];
  readonly requestId: string;
  readonly requestedAt: Date;
  readonly requesterType: string;
  readonly status: string;
  readonly taskId: string | null;
  readonly taskStatus: string | null;
  readonly valetSessionId: string;
  readonly assigneeMembershipId: string | null;
}

export async function listRetrievalQueue(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    cursor?: string;
    limit: number;
    locationId: string;
  },
): Promise<{ items: RetrievalQueueEntry[]; nextCursor: string | null }> {
  const cursor = queueCursorCodec.decode(input.cursor);
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      capability: "LOCATION_DASHBOARD_READ",
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);
    const predicates = [
      "request.organization_id = $1",
      "session.location_id = $2",
      "request.status IN ('OPEN', 'ACCEPTED')",
    ];
    const parameters: unknown[] = [scope.organizationId, input.locationId];
    if (cursor !== null) {
      parameters.push(cursor.sortKey, cursor.tiebreakerId);
      predicates.push(
        `(request.requested_at, request.id) > ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`,
      );
    }
    parameters.push(input.limit + 1);
    const rows = await transaction.query<QueueRow>(
      `SELECT request.id::text AS "requestId",
              request.requested_at AS "requestedAt",
              request.status::text AS status,
              request.requested_by_type::text AS "requesterType",
              request.valet_session_id::text AS "valetSessionId",
              current_task.id::text AS "taskId",
              current_task.status::text AS "taskStatus",
              current_task.current_assignee_membership_id::text
                AS "assigneeMembershipId",
              ${operationalAssigneeColumn}
       FROM retrieval_requests AS request
       INNER JOIN valet_sessions AS session
         ON session.organization_id = request.organization_id
        AND session.id = request.valet_session_id
       LEFT JOIN LATERAL (
           SELECT task.id, task.organization_id, task.location_id, task.status,
                  task.current_assignee_membership_id
           FROM tasks AS task
           WHERE task.organization_id = request.organization_id
             AND task.valet_session_id = request.valet_session_id
             AND task.task_type = 'RETRIEVAL'
             AND task.location_id = session.location_id
             AND task.status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
           ORDER BY task.created_at DESC, task.id DESC
           LIMIT 1
       ) AS current_task ON TRUE
       ${operationalAssigneeJoins("current_task")}
       WHERE ${predicates.join(" AND ")}
       ORDER BY request.requested_at ASC, request.id ASC
       LIMIT $${parameters.length}`,
      parameters,
    );
    const items = rows.rows
      .slice(0, input.limit)
      .map((row): RetrievalQueueEntry => ({
        requestId: row.requestId,
        requestedAt: row.requestedAt.toISOString(),
        requesterType:
          row.requesterType as RetrievalQueueEntry["requesterType"],
        status: row.status as RetrievalQueueEntry["status"],
        task:
          row.taskId === null
            ? null
            : {
                currentAssigneeMembershipId: row.assigneeMembershipId,
                assignee: row.assignee,
                status: row.taskStatus as NonNullable<
                  RetrievalQueueEntry["task"]
                >["status"],
                taskId: row.taskId,
              },
        valetSessionId: row.valetSessionId,
      }));
    const last = rows.rows[input.limit - 1];
    const nextCursor =
      rows.rows.length > input.limit && last !== undefined
        ? queueCursorCodec.encode({
            sortKey: last.requestedAt.toISOString(),
            tiebreakerId: last.requestId,
          })
        : null;
    return { items, nextCursor };
  });
}

interface TaskRow {
  readonly assignee: TaskOverviewEntry["assignee"];
  readonly createdAt: Date;
  readonly currentAssigneeMembershipId: string | null;
  readonly status: string;
  readonly taskId: string;
  readonly taskType: string;
  readonly updatedAt: Date;
  readonly valetSessionId: string;
}

export async function listDashboardTasks(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    cursor?: string;
    limit: number;
    locationId: string;
  },
): Promise<{ items: TaskOverviewEntry[]; nextCursor: string | null }> {
  const cursor = taskCursorCodec.decode(input.cursor);
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      capability: "LOCATION_DASHBOARD_READ",
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);
    const predicates = ["task.organization_id = $1", "task.location_id = $2"];
    const parameters: unknown[] = [scope.organizationId, input.locationId];
    if (cursor !== null) {
      parameters.push(cursor.sortKey, cursor.tiebreakerId);
      predicates.push(
        `(task.created_at, task.id) < ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`,
      );
    }
    parameters.push(input.limit + 1);
    const rows = await transaction.query<TaskRow>(
      `SELECT task.id::text AS "taskId",
              task.task_type::text AS "taskType",
              task.status::text AS status,
              task.valet_session_id::text AS "valetSessionId",
              task.current_assignee_membership_id::text
                AS "currentAssigneeMembershipId",
              task.created_at AS "createdAt",
              task.updated_at AS "updatedAt",
              ${operationalAssigneeColumn}
       FROM tasks AS task
       ${operationalAssigneeJoins("task")}
       WHERE ${predicates.join(" AND ")}
       ORDER BY task.created_at DESC, task.id DESC
       LIMIT $${parameters.length}`,
      parameters,
    );
    const items = rows.rows
      .slice(0, input.limit)
      .map((row): TaskOverviewEntry => ({
        createdAt: row.createdAt.toISOString(),
        currentAssigneeMembershipId: row.currentAssigneeMembershipId,
        assignee: row.assignee,
        status: row.status as TaskOverviewEntry["status"],
        taskId: row.taskId,
        taskType: row.taskType as TaskOverviewEntry["taskType"],
        updatedAt: row.updatedAt.toISOString(),
        valetSessionId: row.valetSessionId,
      }));
    const last = rows.rows[input.limit - 1];
    const nextCursor =
      rows.rows.length > input.limit && last !== undefined
        ? taskCursorCodec.encode({
            sortKey: last.createdAt.toISOString(),
            tiebreakerId: last.taskId,
          })
        : null;
    return { items, nextCursor };
  });
}
