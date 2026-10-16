import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { DispatchOperationError } from "./dispatch-errors";
import type { AuthorizedTaskActor, LockedTaskRow } from "./dispatch-types";

const taskColumns = `id::text, organization_id::text, location_id::text,
  valet_session_id::text, task_type::text, status::text,
  current_assignee_membership_id::text, version, created_at, updated_at`;

export async function lockOperationalTask(
  transaction: PostgresTransaction,
  taskId: string,
): Promise<LockedTaskRow> {
  const result = await transaction.query<LockedTaskRow>(
    `SELECT ${taskColumns} FROM tasks WHERE id = $1 FOR UPDATE`,
    [taskId],
  );
  const task = result.rows[0];
  if (
    task === undefined ||
    (task.task_type !== "PARKING" && task.task_type !== "RETRIEVAL")
  ) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return task;
}

export async function requireTaskActor(
  transaction: PostgresTransaction,
  task: LockedTaskRow,
  authenticatedUserId: string,
): Promise<AuthorizedTaskActor> {
  const result = await transaction.query<{ membershipId: string }>(
    `SELECT id::text AS "membershipId"
     FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [task.organization_id, authenticatedUserId],
  );
  const actor = result.rows[0];
  if (actor === undefined) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: task.location_id,
    membershipId: actor.membershipId,
  });
  if (eligibility === null) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  // The eligibility check holds a FOR SHARE membership lock through COMMIT.
  // A role read before that lock may be a stale pre-demotion snapshot.
  const lockedRole = await transaction.query<{ role: string }>(
    `SELECT role::text FROM organization_memberships WHERE id = $1 FOR SHARE`,
    [actor.membershipId],
  );
  const role = lockedRole.rows[0]?.role;
  if (role === undefined) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return { membershipId: actor.membershipId, role };
}

export async function requireEligibleAssignee(
  transaction: PostgresTransaction,
  task: LockedTaskRow,
  membershipId: string,
): Promise<void> {
  const scope = await transaction.query<{ allowed: boolean }>(
    `SELECT true AS allowed FROM organization_memberships
     WHERE organization_id = $1 AND id = $2`,
    [task.organization_id, membershipId],
  );
  if (scope.rows[0]?.allowed !== true) {
    throw new DispatchOperationError("TASK_ASSIGNEE_NOT_ELIGIBLE");
  }
  if (
    (await lockShiftOperationalEligibility(transaction, {
      locationId: task.location_id,
      membershipId,
    })) === null
  ) {
    throw new DispatchOperationError("TASK_ASSIGNEE_NOT_ELIGIBLE");
  }
}
