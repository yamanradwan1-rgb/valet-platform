import type { PostgresPool } from "../../common/database/postgres";
import { rankEligibleTaskAssignees } from "./assignment-ranking";
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

interface AssignTaskRequest {
  readonly assignmentMode?: "AUTOMATIC";
  readonly authenticatedUserId: string;
  readonly expectedVersion: number;
  readonly targetAssigneeMembershipId?: string;
  readonly taskId: string;
}

export function createAssignTaskCommandExecutor(
  pool: PostgresPool,
  options: TaskMutationOptions = {},
) {
  return (request: AssignTaskRequest) =>
    inDispatchTransaction(pool, async (transaction) => {
      const task = await lockParkingTask(transaction, request.taskId);
      const actor = await requireTaskActor(
        transaction,
        task,
        request.authenticatedUserId,
      );
      requireExpectedTaskVersion(task, request.expectedVersion);
      requireTaskStatus(task, ["QUEUED"]);
      if (task.current_assignee_membership_id !== null) {
        throw new DispatchOperationError("TASK_INVALID_STATE");
      }

      let targetId = request.targetAssigneeMembershipId ?? actor.membershipId;
      if (request.assignmentMode === "AUTOMATIC") {
        if (actor.role !== "VALET_SUPERVISOR") {
          throw new DispatchOperationError("TASK_ASSIGNMENT_CONFLICT");
        }
        const ranked = await rankEligibleTaskAssignees(transaction, {
          locationId: task.location_id,
          organizationId: task.organization_id,
        });
        const first = ranked[0];
        if (first === undefined) {
          throw new DispatchOperationError("TASK_ASSIGNEE_NOT_ELIGIBLE");
        }
        targetId = first.membershipId;
      } else if (
        targetId !== actor.membershipId &&
        actor.role !== "VALET_SUPERVISOR"
      ) {
        throw new DispatchOperationError("TASK_ASSIGNMENT_CONFLICT");
      }
      await requireEligibleAssignee(transaction, task, targetId);
      const operationTime = await loadDispatchOperationTime(transaction);
      return recordTaskMutation(
        transaction,
        {
          actorMembershipId: actor.membershipId,
          assigneeMembershipId: targetId,
          auditEventType: "TASK_ASSIGNED",
          dispatchEventType: "ASSIGNED",
          operationTime,
          previousAssigneeMembershipId: null,
          reason: null,
          status: "ASSIGNED",
          task,
        },
        options,
      );
    });
}
