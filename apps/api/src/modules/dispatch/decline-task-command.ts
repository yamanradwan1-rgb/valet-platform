import type { PostgresPool } from "../../common/database/postgres";
import { lockParkingTask, requireTaskActor } from "./task-authorization";
import { DispatchOperationError } from "./dispatch-errors";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "./dispatch-transaction";
import { requireExpectedTaskVersion, requireTaskStatus } from "./task-mutation";
import {
  recordTaskMutation,
  type TaskMutationOptions,
} from "./record-task-mutation";

export function createDeclineTaskCommandExecutor(
  pool: PostgresPool,
  options: TaskMutationOptions = {},
) {
  return (request: {
    readonly authenticatedUserId: string;
    readonly expectedVersion: number;
    readonly reason?: string;
    readonly taskId: string;
  }) =>
    inDispatchTransaction(pool, async (transaction) => {
      const task = await lockParkingTask(transaction, request.taskId);
      const actor = await requireTaskActor(
        transaction,
        task,
        request.authenticatedUserId,
      );
      if (task.current_assignee_membership_id !== actor.membershipId) {
        throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
      }
      requireExpectedTaskVersion(task, request.expectedVersion);
      requireTaskStatus(task, ["ASSIGNED"]);
      const reason = request.reason?.trim() || null;
      const operationTime = await loadDispatchOperationTime(transaction);
      return recordTaskMutation(
        transaction,
        {
          actorMembershipId: actor.membershipId,
          assigneeMembershipId: null,
          auditEventType: "TASK_DECLINED",
          dispatchEventType: "DECLINED",
          operationTime,
          previousAssigneeMembershipId: actor.membershipId,
          reason,
          status: "QUEUED",
          task,
        },
        options,
      );
    });
}
