import type { PostgresTransaction } from "../../common/database/postgres";
import { appendDispatchEvent } from "./dispatch-event-writer";
import type { Val005eDispatchEventType } from "./dispatch-event-writer";
import { appendTaskAuditEvent } from "./task-audit-event-writer";
import type { TaskAuditEventType } from "./task-audit-event-writer";
import { mutateTask } from "./task-mutation";
import type {
  LockedTaskRow,
  OperationalTaskStatus,
  TaskProjection,
} from "./dispatch-types";
import { toTaskProjection } from "./dispatch-types";

export interface TaskMutationOptions {
  readonly auditEventIdFactory?: () => string;
  readonly dispatchEventIdFactory?: () => string;
}

export async function recordTaskMutation(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly assigneeMembershipId: string | null;
    readonly auditEventType: TaskAuditEventType;
    readonly dispatchEventType: Val005eDispatchEventType;
    readonly operationTime: Date;
    readonly previousAssigneeMembershipId: string | null;
    readonly reason: string | null;
    readonly status: OperationalTaskStatus;
    readonly task: LockedTaskRow & { status: OperationalTaskStatus };
  },
  options: TaskMutationOptions,
): Promise<TaskProjection> {
  const updated = await mutateTask(transaction, {
    assigneeMembershipId: input.assigneeMembershipId,
    operationTime: input.operationTime,
    status: input.status,
    task: input.task,
  });
  await appendDispatchEvent(
    transaction,
    {
      actorMembershipId: input.actorMembershipId,
      eventType: input.dispatchEventType,
      newAssigneeMembershipId: input.assigneeMembershipId,
      occurredAt: input.operationTime,
      previousAssigneeMembershipId: input.previousAssigneeMembershipId,
      reason: input.reason,
      task: input.task,
    },
    options.dispatchEventIdFactory,
  );
  await appendTaskAuditEvent(
    transaction,
    {
      actorMembershipId: input.actorMembershipId,
      eventType: input.auditEventType,
      fromStatus: input.task.status,
      newAssigneeMembershipId: input.assigneeMembershipId,
      occurredAt: input.operationTime,
      previousAssigneeMembershipId: input.previousAssigneeMembershipId,
      reason: input.reason,
      task: input.task,
      toStatus: input.status,
      toVersion: updated.version,
    },
    options.auditEventIdFactory,
  );
  return toTaskProjection(updated);
}
