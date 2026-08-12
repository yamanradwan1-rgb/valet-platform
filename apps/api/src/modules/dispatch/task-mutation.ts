import type { PostgresTransaction } from "../../common/database/postgres";
import { DispatchOperationError } from "./dispatch-errors";
import type { LockedTaskRow, OperationalTaskStatus } from "./dispatch-types";

export function requireExpectedTaskVersion(
  task: LockedTaskRow,
  expectedVersion: number,
): void {
  if (task.version !== expectedVersion) {
    throw new DispatchOperationError("VERSION_CONFLICT");
  }
}

export function requireTaskStatus(
  task: LockedTaskRow,
  statuses: readonly OperationalTaskStatus[],
): asserts task is LockedTaskRow & { status: OperationalTaskStatus } {
  if (!statuses.includes(task.status as OperationalTaskStatus)) {
    throw new DispatchOperationError("TASK_INVALID_STATE");
  }
}

export async function mutateTask(
  transaction: PostgresTransaction,
  input: {
    readonly assigneeMembershipId: string | null;
    readonly operationTime: Date;
    readonly status: OperationalTaskStatus;
    readonly task: LockedTaskRow;
  },
): Promise<LockedTaskRow> {
  const result = await transaction.query<LockedTaskRow>(
    `UPDATE tasks
     SET status = $2, current_assignee_membership_id = $3,
         version = version + 1, updated_at = $4
     WHERE id = $1 AND version = $5
     RETURNING id::text, organization_id::text, location_id::text,
       valet_session_id::text, task_type::text, status::text,
       current_assignee_membership_id::text, version, created_at, updated_at`,
    [
      input.task.id,
      input.status,
      input.assigneeMembershipId,
      input.operationTime,
      input.task.version,
    ],
  );
  const updated = result.rows[0];
  if (updated === undefined)
    throw new DispatchOperationError("VERSION_CONFLICT");
  return updated;
}
