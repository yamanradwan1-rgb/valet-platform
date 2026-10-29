import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { HandoffError } from "./handoff-errors";
import type {
  HandoffActor,
  HandoffScope,
  LockedHandoffRequest,
  LockedHandoffSession,
  LockedHandoffTask,
  LockedHandoffVerification,
} from "./handoff-types";

export async function lockHandoffSession(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<LockedHandoffSession> {
  const result = await transaction.query<LockedHandoffSession>(
    `SELECT id::text, organization_id::text, location_id::text, state::text,
            version, retrieval_requested_at, retrieval_started_at, ready_at,
            handoff_pending_at
     FROM valet_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined)
    throw new HandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  return session;
}

export async function resolveHandoffActor(
  transaction: PostgresTransaction,
  session: HandoffScope,
  authenticatedUserId: string,
): Promise<HandoffActor> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text
     FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [session.organization_id, authenticatedUserId],
  );
  const actor = result.rows[0];
  if (actor === undefined)
    throw new HandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  return { membershipId: actor.id };
}

export async function lockHandoffTask(
  transaction: PostgresTransaction,
  session: HandoffScope,
): Promise<LockedHandoffTask> {
  const result = await transaction.query<LockedHandoffTask>(
    `SELECT id::text, status::text, current_assignee_membership_id::text,
            version
     FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_type = 'RETRIEVAL'
       AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
     FOR UPDATE`,
    [session.organization_id, session.location_id, session.id],
  );
  const task = result.rows[0];
  if (task === undefined) throw new HandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  return task;
}

export async function lockHandoffRequest(
  transaction: PostgresTransaction,
  session: HandoffScope,
): Promise<LockedHandoffRequest> {
  const result = await transaction.query<LockedHandoffRequest>(
    `SELECT id::text, status::text
     FROM retrieval_requests
     WHERE organization_id = $1 AND valet_session_id = $2
       AND status IN ('OPEN', 'ACCEPTED')
     FOR UPDATE`,
    [session.organization_id, session.id],
  );
  const request = result.rows[0];
  if (request === undefined)
    throw new HandoffError("RETRIEVAL_REQUEST_NOT_READY");
  return request;
}

export async function authorizeHandoffOwner(
  transaction: PostgresTransaction,
  session: LockedHandoffSession,
  task: LockedHandoffTask,
  actor: HandoffActor,
): Promise<void> {
  if (task.current_assignee_membership_id !== actor.membershipId) {
    throw new HandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId: actor.membershipId,
  });
  if (eligibility === null)
    throw new HandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
}

export async function authorizeHandoffSupervisor(
  transaction: PostgresTransaction,
  session: LockedHandoffSession,
  actor: HandoffActor,
): Promise<void> {
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId: actor.membershipId,
  });
  if (eligibility === null)
    throw new HandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  // Eligibility locks the membership row FOR SHARE through transaction commit.
  // Re-read the role only after that lock: an unlocked earlier role snapshot
  // could belong to a Supervisor who was demoted while the lock was awaited.
  const currentRole = await transaction.query<{ role: string }>(
    `SELECT role::text FROM organization_memberships WHERE id = $1 FOR SHARE`,
    [actor.membershipId],
  );
  if (currentRole.rows[0]?.role !== "VALET_SUPERVISOR") {
    throw new HandoffError("HANDOFF_OVERRIDE_NOT_ALLOWED");
  }
}

export async function authorizeHandoffAbort(
  transaction: PostgresTransaction,
  session: LockedHandoffSession,
  task: LockedHandoffTask,
  actor: HandoffActor,
): Promise<void> {
  if (task.current_assignee_membership_id === actor.membershipId) {
    await authorizeHandoffOwner(transaction, session, task, actor);
    return;
  }
  await authorizeHandoffSupervisor(transaction, session, actor);
}

export async function lockUnconsumedVerification(
  transaction: PostgresTransaction,
  session: HandoffScope,
): Promise<(LockedHandoffVerification & {
  readonly verified_by_membership_id: string | null;
}) | undefined> {
  const result = await transaction.query<LockedHandoffVerification & {
    readonly verified_by_membership_id: string | null;
  }>(
    `SELECT id::text, method::text, secret_hash, expires_at, attempt_count,
            max_attempts, verified_at, verified_by_membership_id::text,
            consumed_at, created_at
     FROM handoff_verifications
     WHERE organization_id = $1 AND valet_session_id = $2
       AND consumed_at IS NULL
     ORDER BY created_at DESC, id DESC
     FOR UPDATE`,
    [session.organization_id, session.id],
  );
  if (result.rows.length > 1) {
    throw new Error("Multiple unconsumed handoff verifications exist.");
  }
  return result.rows[0];
}

export function assertHandoffLifecycle(
  session: LockedHandoffSession,
  task: LockedHandoffTask,
  request: LockedHandoffRequest,
  expectedVersion: number,
  expectedState: "READY" | "HANDOFF_PENDING",
): void {
  if (session.version !== expectedVersion)
    throw new HandoffError("VERSION_CONFLICT");
  if (task.status !== "IN_PROGRESS")
    throw new HandoffError("TASK_INVALID_STATE");
  if (request.status !== "ACCEPTED")
    throw new HandoffError("RETRIEVAL_REQUEST_NOT_READY");
  if (
    session.state !== expectedState ||
    session.retrieval_requested_at === null ||
    session.retrieval_started_at === null ||
    session.ready_at === null ||
    (expectedState === "READY" && session.handoff_pending_at !== null) ||
    (expectedState === "HANDOFF_PENDING" && session.handoff_pending_at === null)
  ) {
    throw new HandoffError("INVALID_STATE_TRANSITION");
  }
}
