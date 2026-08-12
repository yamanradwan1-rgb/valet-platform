import type { PostgresPool } from "../../common/database/postgres";
import {
  lockParkingTask,
  requireEligibleAssignee,
  requireTaskActor,
} from "./task-authorization";
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

export function createReassignTaskCommandExecutor(
  pool: PostgresPool,
  options: TaskMutationOptions = {},
) {
  return (request: {
    readonly authenticatedUserId: string;
    readonly expectedVersion: number;
    readonly reason: string;
    readonly targetAssigneeMembershipId: string;
    readonly taskId: string;
  }) =>
    inDispatchTransaction(pool, async (transaction) => {
      const task = await lockParkingTask(transaction, request.taskId);
      const actor = await requireTaskActor(
        transaction,
        task,
        request.authenticatedUserId,
      );
      if (actor.role !== "VALET_SUPERVISOR") {
        throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
      }
      requireExpectedTaskVersion(task, request.expectedVersion);
      requireTaskStatus(task, ["ASSIGNED", "ACCEPTED"]);
      const reason = request.reason.trim();
      if (reason === "") {
        throw new DispatchOperationError("TASK_REASSIGN_REASON_REQUIRED");
      }
      if (
        task.current_assignee_membership_id ===
        request.targetAssigneeMembershipId
      ) {
        throw new DispatchOperationError("TASK_ASSIGNMENT_CONFLICT");
      }
      await requireEligibleAssignee(
        transaction,
        task,
        request.targetAssigneeMembershipId,
      );
      const operationTime = await loadDispatchOperationTime(transaction);
      return recordTaskMutation(
        transaction,
        {
          actorMembershipId: actor.membershipId,
          assigneeMembershipId: request.targetAssigneeMembershipId,
          auditEventType: "TASK_REASSIGNED",
          dispatchEventType: "REASSIGNED",
          operationTime,
          previousAssigneeMembershipId: task.current_assignee_membership_id,
          reason,
          status: task.status,
          task,
        },
        options,
      );
    });
}
