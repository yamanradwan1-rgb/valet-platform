import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import type { ValetSessionState } from "../valet-sessions/protected-custody-command";

export interface GuestRetrievalProgression {
  readonly state: ValetSessionState;
  readonly valetSessionId: string;
  readonly vehicle: {
    readonly color: string | null;
    readonly make: string | null;
    readonly model: string | null;
  };
}

export type RequestRetrievalOutcome =
  | { readonly kind: "INVALID_STATE" }
  | { readonly kind: "SUCCESS"; readonly session: GuestRetrievalProgression };

type RetrievalRequestStatus = "ACCEPTED" | "CANCELLED" | "COMPLETED" | "OPEN";
type RetrievalTaskStatus =
  | "ACCEPTED"
  | "ASSIGNED"
  | "CANCELLED"
  | "COMPLETED"
  | "IN_PROGRESS"
  | "QUEUED";

interface LockedSessionRow {
  readonly color: string | null;
  readonly customer_id: string | null;
  readonly location_id: string;
  readonly make: string | null;
  readonly model: string | null;
  readonly organization_id: string;
  readonly state: ValetSessionState;
  readonly valet_session_id: string;
  readonly version: number;
}

interface StatusRow<T extends string> {
  readonly status: T;
}

interface RetrievalLifecycle {
  readonly activeRequest?: RetrievalRequestStatus;
  readonly activeTask?: RetrievalTaskStatus;
  readonly latestRequest?: RetrievalRequestStatus;
  readonly latestTask?: RetrievalTaskStatus;
}

class RetrievalIntegrityError extends Error {
  constructor() {
    super("Retrieval persistence is inconsistent.");
    this.name = "RetrievalIntegrityError";
  }
}

async function lockSession(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<LockedSessionRow> {
  const result = await transaction.query<LockedSessionRow>(
    `SELECT session.id::text AS valet_session_id,
            session.organization_id::text, session.location_id::text,
            session.customer_id::text, session.state::text, session.version,
            vehicle.make, vehicle.model, vehicle.color
     FROM valet_sessions AS session
     INNER JOIN vehicles AS vehicle
       ON vehicle.organization_id = session.organization_id
      AND vehicle.id = session.vehicle_id
     WHERE session.id = $1
     FOR UPDATE OF session`,
    [valetSessionId],
  );
  const session = result.rows[0];
  if (session === undefined) throw new RetrievalIntegrityError();
  return session;
}

async function loadLifecycle(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<RetrievalLifecycle> {
  const activeRequest = await transaction.query<StatusRow<RetrievalRequestStatus>>(
    `SELECT status::text AS status FROM retrieval_requests
     WHERE valet_session_id = $1 AND status IN ('OPEN', 'ACCEPTED')`,
    [valetSessionId],
  );
  const activeTask = await transaction.query<StatusRow<RetrievalTaskStatus>>(
    `SELECT status::text AS status FROM tasks
     WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL'
       AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')`,
    [valetSessionId],
  );
  if (activeRequest.rows.length > 1 || activeTask.rows.length > 1) {
    throw new RetrievalIntegrityError();
  }
  const latestRequest = await transaction.query<StatusRow<RetrievalRequestStatus>>(
    `SELECT status::text AS status FROM retrieval_requests
     WHERE valet_session_id = $1
     ORDER BY requested_at DESC, created_at DESC, id DESC LIMIT 1`,
    [valetSessionId],
  );
  const latestTask = await transaction.query<StatusRow<RetrievalTaskStatus>>(
    `SELECT status::text AS status FROM tasks
     WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL'
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [valetSessionId],
  );
  return {
    activeRequest: activeRequest.rows[0]?.status,
    activeTask: activeTask.rows[0]?.status,
    latestRequest: latestRequest.rows[0]?.status,
    latestTask: latestTask.rows[0]?.status,
  };
}

function progression(session: LockedSessionRow): GuestRetrievalProgression {
  return {
    state: session.state,
    valetSessionId: session.valet_session_id,
    vehicle: {
      color: session.color,
      make: session.make,
      model: session.model,
    },
  };
}

function isCoherentRetry(
  state: ValetSessionState,
  lifecycle: RetrievalLifecycle,
): boolean {
  if (state === "REQUESTED") {
    return (
      lifecycle.activeRequest === "OPEN" &&
      ["QUEUED", "ASSIGNED", "ACCEPTED"].includes(lifecycle.activeTask ?? "")
    );
  }
  if (state === "RETRIEVING") {
    return lifecycle.activeRequest === "ACCEPTED" && lifecycle.activeTask === "IN_PROGRESS";
  }
  if (state === "READY" || state === "HANDOFF_PENDING") {
    return (
      lifecycle.activeRequest === "ACCEPTED" &&
      lifecycle.activeTask === undefined &&
      lifecycle.latestTask === "COMPLETED"
    );
  }
  if (state === "COMPLETED") {
    return (
      lifecycle.activeRequest === undefined &&
      lifecycle.activeTask === undefined &&
      lifecycle.latestRequest === "COMPLETED" &&
      lifecycle.latestTask === "COMPLETED"
    );
  }
  return false;
}

async function operationTime(transaction: PostgresTransaction): Promise<Date> {
  const result = await transaction.query<{ operation_time: Date }>(
    "SELECT clock_timestamp() AS operation_time",
  );
  const value = result.rows[0]?.operation_time;
  if (value === undefined) throw new RetrievalIntegrityError();
  return value;
}

async function createFirstRequest(
  transaction: PostgresTransaction,
  session: LockedSessionRow,
): Promise<GuestRetrievalProgression> {
  const occurredAt = await operationTime(transaction);
  const requestId = randomUUID();
  const taskId = randomUUID();
  await transaction.query(
    `INSERT INTO retrieval_requests
       (id, organization_id, valet_session_id, requested_by_type,
        requested_by_customer_id, requested_by_membership_id, status,
        requested_at, created_at)
     VALUES ($1, $2, $3, 'CUSTOMER', $4, NULL, 'OPEN', $5, $5)`,
    [requestId, session.organization_id, session.valet_session_id, session.customer_id, occurredAt],
  );
  await transaction.query(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type, status,
        current_assignee_membership_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'QUEUED', NULL, 1, $5, $5)`,
    [taskId, session.organization_id, session.location_id, session.valet_session_id, occurredAt],
  );
  await appendDispatchEvent(transaction, {
    actorMembershipId: null,
    eventType: "QUEUED",
    newAssigneeMembershipId: null,
    occurredAt,
    previousAssigneeMembershipId: null,
    reason: null,
    task: {
      id: taskId,
      location_id: session.location_id,
      organization_id: session.organization_id,
      valet_session_id: session.valet_session_id,
    },
  });
  const updated = await transaction.query<{ version: number }>(
    `UPDATE valet_sessions
     SET state = 'REQUESTED', retrieval_requested_at = $2,
         updated_at = $2, version = version + 1
     WHERE id = $1 AND state = 'PARKED' AND version = $3
     RETURNING version`,
    [session.valet_session_id, occurredAt, session.version],
  );
  const toVersion = updated.rows[0]?.version;
  if (updated.rowCount !== 1 || toVersion !== session.version + 1) {
    throw new RetrievalIntegrityError();
  }
  await appendCustodyAuditEvent(transaction, {
    definition: {
      eventType: "RETRIEVAL_REQUESTED",
      metadata: {
        actorType: "GUEST",
        fromState: "PARKED",
        fromVersion: session.version,
        requesterType: "CUSTOMER",
        toState: "REQUESTED",
        toVersion,
      },
    },
    occurredAt,
    scope: {
      actorMembershipId: null,
      locationId: session.location_id,
      organizationId: session.organization_id,
      valetSessionId: session.valet_session_id,
    },
  });
  return { ...progression(session), state: "REQUESTED" };
}

export async function requestRetrievalInTransaction(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<RequestRetrievalOutcome> {
  const session = await lockSession(transaction, valetSessionId);
  const lifecycle = await loadLifecycle(transaction, valetSessionId);

  if (session.state === "PARKED") {
    if (lifecycle.activeRequest !== undefined || lifecycle.activeTask !== undefined) {
      throw new RetrievalIntegrityError();
    }
    return { kind: "SUCCESS", session: await createFirstRequest(transaction, session) };
  }
  if (isCoherentRetry(session.state, lifecycle)) {
    return { kind: "SUCCESS", session: progression(session) };
  }
  if (lifecycle.activeRequest !== undefined || lifecycle.activeTask !== undefined) {
    throw new RetrievalIntegrityError();
  }
  return { kind: "INVALID_STATE" };
}
