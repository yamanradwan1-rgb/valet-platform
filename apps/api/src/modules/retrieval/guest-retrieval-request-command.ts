import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import {
  appendCustodyAuditEvent,
  type PersistedCustodyAuditScope,
} from "../audit/custody-audit-event-writer";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import { loadDispatchOperationTime } from "../dispatch/dispatch-transaction";
import { persistRetrievalPushAttention } from "../staff-push/retrieval-push-attention-writer";
import type { StaffPushIntentCreationPolicy } from "../staff-push/staff-push-operational-policy";
import type { LockedGuestAccessSessionScope } from "../valet-sessions/guest-access-session-resolution";

export class GuestRetrievalRequestError extends Error {
  readonly code = "INVALID_STATE_TRANSITION" as const;

  constructor() {
    super("Retrieval cannot be requested from the current session state.");
    this.name = "GuestRetrievalRequestError";
  }
}

interface LifecycleRow {
  readonly status: string;
}

function guestAuditScope(
  session: LockedGuestAccessSessionScope,
): PersistedCustodyAuditScope {
  return {
    actorMembershipId: null,
    actorType: "GUEST",
    locationId: session.locationId,
    organizationId: session.organizationId,
    valetSessionId: session.valetSessionId,
  };
}

async function activeRows(
  transaction: PostgresTransaction,
  session: LockedGuestAccessSessionScope,
): Promise<{
  readonly requests: LifecycleRow[];
  readonly tasks: LifecycleRow[];
}> {
  const [requests, tasks] = await Promise.all([
    transaction.query<LifecycleRow>(
      `SELECT status::text
       FROM retrieval_requests
       WHERE organization_id = $1 AND valet_session_id = $2
         AND status IN ('OPEN', 'ACCEPTED')`,
      [session.organizationId, session.valetSessionId],
    ),
    transaction.query<LifecycleRow>(
      `SELECT status::text
       FROM tasks
       WHERE organization_id = $1 AND location_id = $2 AND valet_session_id = $3
         AND task_type = 'RETRIEVAL'
         AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')`,
      [session.organizationId, session.locationId, session.valetSessionId],
    ),
  ]);
  return { requests: requests.rows, tasks: tasks.rows };
}

function isCoherentCurrentLifecycle(
  state: LockedGuestAccessSessionScope["state"],
  lifecycle: {
    readonly requests: LifecycleRow[];
    readonly tasks: LifecycleRow[];
  },
): boolean {
  if (state === "REQUESTED") {
    return (
      lifecycle.requests.length === 1 &&
      lifecycle.requests[0]?.status === "OPEN" &&
      lifecycle.tasks.length === 1
    );
  }
  if (["RETRIEVING", "READY", "HANDOFF_PENDING"].includes(state)) {
    return (
      lifecycle.requests.length === 1 &&
      lifecycle.requests[0]?.status === "ACCEPTED" &&
      lifecycle.tasks.length === 1
    );
  }
  return false;
}

async function isCoherentCompletedLifecycle(
  transaction: PostgresTransaction,
  session: LockedGuestAccessSessionScope,
): Promise<boolean> {
  const [requests, tasks] = await Promise.all([
    transaction.query<LifecycleRow>(
      `SELECT status::text FROM retrieval_requests
       WHERE organization_id = $1 AND valet_session_id = $2 AND status = 'COMPLETED'`,
      [session.organizationId, session.valetSessionId],
    ),
    transaction.query<LifecycleRow>(
      `SELECT status::text FROM tasks
       WHERE organization_id = $1 AND location_id = $2 AND valet_session_id = $3
         AND task_type = 'RETRIEVAL' AND status = 'COMPLETED'`,
      [session.organizationId, session.locationId, session.valetSessionId],
    ),
  ]);
  return requests.rowCount === 1 && tasks.rowCount === 1;
}

export async function requestGuestRetrieval(
  transaction: PostgresTransaction,
  session: LockedGuestAccessSessionScope,
  pushPolicy: StaffPushIntentCreationPolicy,
  pushCreationEnabled = true,
): Promise<LockedGuestAccessSessionScope> {
  const lifecycle = await activeRows(transaction, session);
  if (session.state === "PARKED") {
    if (lifecycle.requests.length !== 0 || lifecycle.tasks.length !== 0) {
      throw new Error("Parked session has active Retrieval persistence.");
    }
  } else if (
    session.retrievalRequestedAt !== null &&
    isCoherentCurrentLifecycle(session.state, lifecycle)
  ) {
    return session;
  } else if (
    session.state === "COMPLETED" &&
    lifecycle.requests.length === 0 &&
    lifecycle.tasks.length === 0 &&
    session.retrievalRequestedAt !== null &&
    (await isCoherentCompletedLifecycle(transaction, session))
  ) {
    return session;
  } else {
    throw new GuestRetrievalRequestError();
  }

  const operationTime = await loadDispatchOperationTime(transaction);
  const taskId = randomUUID();
  await transaction.query(
    `INSERT INTO retrieval_requests
       (id, organization_id, valet_session_id, requested_by_type,
        requested_by_customer_id, requested_by_membership_id, status, requested_at)
     VALUES ($1, $2, $3, 'CUSTOMER', $4, NULL, 'OPEN', $5)`,
    [
      randomUUID(),
      session.organizationId,
      session.valetSessionId,
      session.customerId,
      operationTime,
    ],
  );
  await transaction.query(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type, status,
        current_assignee_membership_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'QUEUED', NULL, 1, $5, $5)`,
    [
      taskId,
      session.organizationId,
      session.locationId,
      session.valetSessionId,
      operationTime,
    ],
  );
  await appendDispatchEvent(transaction, {
    actorMembershipId: null,
    eventType: "QUEUED",
    newAssigneeMembershipId: null,
    occurredAt: operationTime,
    previousAssigneeMembershipId: null,
    reason: null,
    task: {
      id: taskId,
      location_id: session.locationId,
      organization_id: session.organizationId,
      valet_session_id: session.valetSessionId,
    },
  });
  const updated = await transaction.query(
    `UPDATE valet_sessions
     SET state = 'REQUESTED', retrieval_requested_at = $2, updated_at = $2,
         version = version + 1
     WHERE id = $1 AND state = 'PARKED'`,
    [session.valetSessionId, operationTime],
  );
  if (updated.rowCount !== 1)
    throw new Error("Guest Retrieval state transition lost its lock.");
  await appendCustodyAuditEvent(transaction, {
    definition: {
      eventType: "RETRIEVAL_REQUESTED",
      metadata: {
        actor_type: "GUEST",
        from_state: "PARKED",
        from_version: session.version,
        requester_type: "CUSTOMER",
        to_state: "REQUESTED",
        to_version: session.version + 1,
      },
    },
    occurredAt: operationTime,
    scope: guestAuditScope(session),
  });
  if (pushCreationEnabled) {
    await persistRetrievalPushAttention(
      transaction,
      {
        locationId: session.locationId,
        organizationId: session.organizationId,
        taskId,
        valetSessionId: session.valetSessionId,
      },
      operationTime,
      pushPolicy,
    );
  }
  return { ...session, state: "REQUESTED", version: session.version + 1 };
}
