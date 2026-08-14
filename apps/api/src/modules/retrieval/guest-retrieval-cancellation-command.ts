import type { PostgresTransaction } from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import { loadDispatchOperationTime } from "../dispatch/dispatch-transaction";
import type { LockedGuestAccessSessionScope } from "../valet-sessions/guest-access-session-resolution";

export class GuestRetrievalCancellationError extends Error {
  readonly code = "INVALID_STATE_TRANSITION" as const;

  constructor() {
    super("Retrieval cannot be cancelled from the current session state.");
    this.name = "GuestRetrievalCancellationError";
  }
}

export interface GuestRetrievalCancellationOptions {
  readonly auditEventIdFactory?: () => string;
  readonly dispatchEventIdFactory?: () => string;
}

interface LockedCancellationRequest {
  readonly cancelled_at: Date | null;
  readonly id: string;
  readonly requested_at: Date;
  readonly status: string;
}

interface LockedCancellationTask {
  readonly created_at: Date;
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly updated_at: Date;
  readonly valet_session_id: string;
  readonly version: number;
}

interface ActiveCancellationLifecycle {
  readonly requests: readonly LockedCancellationRequest[];
  readonly tasks: readonly LockedCancellationTask[];
}

async function lockActiveLifecycle(
  transaction: PostgresTransaction,
  session: LockedGuestAccessSessionScope,
): Promise<ActiveCancellationLifecycle> {
  const requests = await transaction.query<LockedCancellationRequest>(
    `SELECT id::text, status::text, requested_at, cancelled_at
     FROM retrieval_requests
     WHERE organization_id = $1 AND valet_session_id = $2
       AND status IN ('OPEN', 'ACCEPTED')
     FOR UPDATE`,
    [session.organizationId, session.valetSessionId],
  );
  const tasks = await transaction.query<LockedCancellationTask>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, status::text,
            current_assignee_membership_id::text, version, created_at,
            updated_at
     FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_type = 'RETRIEVAL'
       AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
     FOR UPDATE`,
    [session.organizationId, session.locationId, session.valetSessionId],
  );
  return { requests: requests.rows, tasks: tasks.rows };
}

function sameInstant(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}

function requireCancellableLifecycle(
  session: LockedGuestAccessSessionScope,
  lifecycle: ActiveCancellationLifecycle,
): {
  readonly request: LockedCancellationRequest;
  readonly task: LockedCancellationTask;
} {
  const request = lifecycle.requests[0];
  const task = lifecycle.tasks[0];
  if (
    session.state !== "REQUESTED" ||
    session.retrievalRequestedAt === null ||
    lifecycle.requests.length !== 1 ||
    lifecycle.tasks.length !== 1 ||
    request?.status !== "OPEN" ||
    task === undefined ||
    !["QUEUED", "ASSIGNED", "ACCEPTED"].includes(task.status) ||
    !sameInstant(request.requested_at, session.retrievalRequestedAt) ||
    !sameInstant(task.created_at, session.retrievalRequestedAt)
  ) {
    throw new GuestRetrievalCancellationError();
  }
  return { request, task };
}

async function isCoherentCancellationRetry(
  transaction: PostgresTransaction,
  session: LockedGuestAccessSessionScope,
  lifecycle: ActiveCancellationLifecycle,
): Promise<boolean> {
  if (
    session.state !== "PARKED" ||
    session.retrievalRequestedAt === null ||
    lifecycle.requests.length !== 0 ||
    lifecycle.tasks.length !== 0
  ) {
    return false;
  }
  const requests = await transaction.query<LockedCancellationRequest>(
    `SELECT id::text, status::text, requested_at, cancelled_at
     FROM retrieval_requests
     WHERE organization_id = $1 AND valet_session_id = $2
       AND status = 'CANCELLED' AND requested_at = $3
     FOR UPDATE`,
    [
      session.organizationId,
      session.valetSessionId,
      session.retrievalRequestedAt,
    ],
  );
  const tasks = await transaction.query<LockedCancellationTask>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, status::text,
            current_assignee_membership_id::text, version, created_at,
            updated_at
     FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_type = 'RETRIEVAL'
       AND status = 'CANCELLED' AND created_at = $4
     FOR UPDATE`,
    [
      session.organizationId,
      session.locationId,
      session.valetSessionId,
      session.retrievalRequestedAt,
    ],
  );
  const request = requests.rows[0];
  const task = tasks.rows[0];
  return (
    requests.rowCount === 1 &&
    tasks.rowCount === 1 &&
    request?.cancelled_at !== null &&
    request?.cancelled_at !== undefined &&
    task !== undefined &&
    sameInstant(request.cancelled_at, task.updated_at)
  );
}

async function cancelRequest(
  transaction: PostgresTransaction,
  request: LockedCancellationRequest,
  session: LockedGuestAccessSessionScope,
  operationTime: Date,
): Promise<void> {
  const result = await transaction.query(
    `UPDATE retrieval_requests
     SET status = 'CANCELLED', cancelled_at = $4
     WHERE id = $1 AND organization_id = $2 AND valet_session_id = $3
       AND status = 'OPEN' AND cancelled_at IS NULL`,
    [request.id, session.organizationId, session.valetSessionId, operationTime],
  );
  if (result.rowCount !== 1) throw new GuestRetrievalCancellationError();
}

async function cancelTask(
  transaction: PostgresTransaction,
  task: LockedCancellationTask,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE tasks
     SET status = 'CANCELLED', version = version + 1, updated_at = $3
     WHERE id = $1 AND version = $2
       AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED')
     RETURNING version`,
    [task.id, task.version, operationTime],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new GuestRetrievalCancellationError();
  return version;
}

async function parkCancelledSession(
  transaction: PostgresTransaction,
  session: LockedGuestAccessSessionScope,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE valet_sessions
     SET state = 'PARKED', version = version + 1, updated_at = $3
     WHERE id = $1 AND version = $2 AND state = 'REQUESTED'
     RETURNING version`,
    [session.valetSessionId, session.version, operationTime],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new GuestRetrievalCancellationError();
  return version;
}

export async function cancelGuestRetrieval(
  transaction: PostgresTransaction,
  session: LockedGuestAccessSessionScope,
  options: GuestRetrievalCancellationOptions = {},
): Promise<LockedGuestAccessSessionScope> {
  const lifecycle = await lockActiveLifecycle(transaction, session);
  if (await isCoherentCancellationRetry(transaction, session, lifecycle)) {
    return session;
  }
  const { request, task } = requireCancellableLifecycle(session, lifecycle);
  const operationTime = await loadDispatchOperationTime(transaction);
  await cancelRequest(transaction, request, session, operationTime);
  const taskVersion = await cancelTask(transaction, task, operationTime);
  await appendDispatchEvent(
    transaction,
    {
      actorMembershipId: null,
      eventType: "CANCELLED",
      newAssigneeMembershipId: null,
      occurredAt: operationTime,
      previousAssigneeMembershipId: task.current_assignee_membership_id,
      reason: null,
      task,
    },
    options.dispatchEventIdFactory,
  );
  const sessionVersion = await parkCancelledSession(
    transaction,
    session,
    operationTime,
  );
  await appendCustodyAuditEvent(
    transaction,
    {
      definition: {
        eventType: "RETRIEVAL_CANCELLED",
        metadata: {
          from_session_state: "REQUESTED",
          from_session_version: session.version,
          from_task_status: task.status,
          from_task_version: task.version,
          requester_type: "CUSTOMER",
          retrieval_request_id: request.id,
          task_id: task.id,
          to_session_state: "PARKED",
          to_session_version: sessionVersion,
          to_task_status: "CANCELLED",
          to_task_version: taskVersion,
        },
      },
      occurredAt: operationTime,
      scope: {
        actorMembershipId: null,
        locationId: session.locationId,
        organizationId: session.organizationId,
        valetSessionId: session.valetSessionId,
      },
    },
    options.auditEventIdFactory,
  );
  return { ...session, state: "PARKED", version: sessionVersion };
}
