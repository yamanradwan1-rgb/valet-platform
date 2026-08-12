import { randomUUID } from "node:crypto";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { appendDispatchEvent } from "./dispatch-event-writer";
import { DispatchOperationError } from "./dispatch-errors";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "./dispatch-transaction";
import type { LockedTaskRow, TaskProjection } from "./dispatch-types";
import { toTaskProjection } from "./dispatch-types";

interface QueueRequest {
  readonly authenticatedUserId: string;
  readonly sessionId: string;
}

interface QueueOptions {
  readonly dispatchEventIdFactory?: () => string;
  readonly taskIdFactory?: () => string;
}

async function lockAuthorizedSession(
  transaction: PostgresTransaction,
  request: QueueRequest,
) {
  const result = await transaction.query<{
    location_id: string;
    membership_id: string | null;
    organization_id: string;
    state: string;
  }>(
    `SELECT session.organization_id::text, session.location_id::text,
            session.state::text, membership.id::text AS membership_id
     FROM valet_sessions AS session
     LEFT JOIN organization_memberships AS membership
       ON membership.organization_id = session.organization_id
      AND membership.user_id = $2
     WHERE session.id = $1
     FOR UPDATE OF session`,
    [request.sessionId, request.authenticatedUserId],
  );
  const session = result.rows[0];
  if (session === undefined || session.membership_id === null) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  if (
    (await lockShiftOperationalEligibility(transaction, {
      locationId: session.location_id,
      membershipId: session.membership_id,
    })) === null
  ) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  if (session.state !== "AWAITING_PARKING") {
    throw new DispatchOperationError("TASK_INVALID_STATE");
  }
  return session as typeof session & { membership_id: string };
}

async function executeQueue(
  transaction: PostgresTransaction,
  request: QueueRequest,
  options: QueueOptions,
): Promise<TaskProjection> {
  const session = await lockAuthorizedSession(transaction, request);
  const existing = await transaction.query<LockedTaskRow>(
    `SELECT id::text, organization_id::text, location_id::text,
       valet_session_id::text, task_type::text, status::text,
       current_assignee_membership_id::text, version, created_at, updated_at
     FROM tasks WHERE valet_session_id = $1 AND task_type = 'PARKING'
       AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')`,
    [request.sessionId],
  );
  if (existing.rows[0] !== undefined) return toTaskProjection(existing.rows[0]);

  const operationTime = await loadDispatchOperationTime(transaction);
  const inserted = await transaction.query<LockedTaskRow>(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type,
        status, current_assignee_membership_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'PARKING', 'QUEUED', NULL, 1, $5, $5)
     RETURNING id::text, organization_id::text, location_id::text,
       valet_session_id::text, task_type::text, status::text,
       current_assignee_membership_id::text, version, created_at, updated_at`,
    [
      options.taskIdFactory?.() ?? randomUUID(),
      session.organization_id,
      session.location_id,
      request.sessionId,
      operationTime,
    ],
  );
  const task = inserted.rows[0];
  if (task === undefined)
    throw new Error("Parking Task insert returned no row.");
  await appendDispatchEvent(
    transaction,
    {
      actorMembershipId: session.membership_id,
      eventType: "QUEUED",
      newAssigneeMembershipId: null,
      occurredAt: operationTime,
      previousAssigneeMembershipId: null,
      reason: null,
      task,
    },
    options.dispatchEventIdFactory,
  );
  return toTaskProjection(task);
}

export function createQueueParkingTaskCommandExecutor(
  pool: PostgresPool,
  options: QueueOptions = {},
) {
  return (request: QueueRequest) =>
    inDispatchTransaction(pool, (transaction) =>
      executeQueue(transaction, request, options),
    );
}
