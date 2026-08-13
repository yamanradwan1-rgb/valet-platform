export type OperationalTaskStatus =
  "QUEUED" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS";

export interface LockedTaskRow {
  readonly created_at: Date;
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly status: OperationalTaskStatus | "COMPLETED" | "CANCELLED";
  readonly task_type: "PARKING" | "RETRIEVAL";
  readonly updated_at: Date;
  readonly valet_session_id: string;
  readonly version: number;
}

export interface AuthorizedTaskActor {
  readonly membershipId: string;
  readonly role: string;
}

export interface TaskProjection {
  readonly createdAt: string;
  readonly currentAssigneeMembershipId: string | null;
  readonly sessionId: string;
  readonly status: OperationalTaskStatus;
  readonly taskId: string;
  readonly taskType: "PARKING" | "RETRIEVAL";
  readonly version: number;
}

export function toTaskProjection(task: LockedTaskRow): TaskProjection {
  if (
    (task.task_type !== "PARKING" && task.task_type !== "RETRIEVAL") ||
    task.status === "COMPLETED" ||
    task.status === "CANCELLED"
  ) {
    throw new Error("Task is outside the operational task projection.");
  }
  return {
    createdAt: task.created_at.toISOString(),
    currentAssigneeMembershipId: task.current_assignee_membership_id,
    sessionId: task.valet_session_id,
    status: task.status,
    taskId: task.id,
    taskType: task.task_type,
    version: task.version,
  };
}
