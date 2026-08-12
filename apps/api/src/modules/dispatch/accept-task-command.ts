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

export function createAcceptTaskCommandExecutor(
  pool: PostgresPool,
  options: TaskMutationOptions = {},
) {
  return (request: {
    readonly authenticatedUserId: string;
    readonly expectedVersion: number;
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
      const operationTime = await loadDispatchOperationTime(transaction);
      return recordTaskMutation(
        transaction,
        {
          actorMembershipId: actor.membershipId,
          assigneeMembershipId: actor.membershipId,
          auditEventType: "TASK_ACCEPTED",
          dispatchEventType: "ACCEPTED",
          operationTime,
          previousAssigneeMembershipId: null,
          reason: null,
          status: "ACCEPTED",
          task,
        },
        options,
      );
    });
}
