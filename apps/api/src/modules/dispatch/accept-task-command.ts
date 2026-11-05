import type { PostgresPool } from "../../common/database/postgres";
import { lockOperationalTask, requireTaskActor } from "./task-authorization";
import { DispatchOperationError } from "./dispatch-errors";
import { inDispatchTransaction } from "./dispatch-transaction";
import { loadPostLockStageTime } from "./stage-postlock-operation-time";
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
      const task = await lockOperationalTask(transaction, request.taskId);
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
      const operationTime = await loadPostLockStageTime(transaction);
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
