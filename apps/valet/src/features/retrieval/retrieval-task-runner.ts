import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  acceptRetrievalTask,
  assignRetrievalTask,
} from "./retrieval-api";

export type RetrievalTaskActionResult =
  | { readonly kind: "DENIED" }
  | {
      readonly kind: "NAVIGATE_ACCEPTED";
      readonly sessionId: string;
      readonly taskId: string;
      readonly taskVersion: number;
    }
  | {
      readonly kind: "NAVIGATE_IN_PROGRESS";
      readonly sessionId: string;
      readonly taskId: string;
      readonly taskVersion: number;
    };

export async function executeRetrievalTaskAction(
  client: EmployeeApiClient,
  task: {
    readonly currentAssigneeMembershipId: string | null;
    readonly sessionId: string;
    readonly status: "QUEUED" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS";
    readonly taskId: string;
    readonly version: number;
  },
  currentMembershipId?: string,
): Promise<RetrievalTaskActionResult> {
  const isAssignedToOther =
    task.currentAssigneeMembershipId !== null &&
    currentMembershipId !== undefined &&
    task.currentAssigneeMembershipId !== currentMembershipId;

  if (isAssignedToOther) {
    return { kind: "DENIED" };
  }

  if (task.status === "IN_PROGRESS") {
    return {
      kind: "NAVIGATE_IN_PROGRESS",
      sessionId: task.sessionId,
      taskId: task.taskId,
      taskVersion: task.version,
    };
  }

  if (task.status === "ACCEPTED") {
    return {
      kind: "NAVIGATE_ACCEPTED",
      sessionId: task.sessionId,
      taskId: task.taskId,
      taskVersion: task.version,
    };
  }

  let currentTaskVersion = task.version;

  if (task.status === "QUEUED") {
    const assignRes = await assignRetrievalTask(
      client,
      task.taskId,
      currentTaskVersion,
    );
    currentTaskVersion = assignRes.version;
    const acceptRes = await acceptRetrievalTask(
      client,
      task.taskId,
      currentTaskVersion,
    );
    return {
      kind: "NAVIGATE_ACCEPTED",
      sessionId: task.sessionId,
      taskId: task.taskId,
      taskVersion: acceptRes.version,
    };
  }

  if (task.status === "ASSIGNED") {
    const acceptRes = await acceptRetrievalTask(
      client,
      task.taskId,
      currentTaskVersion,
    );
    return {
      kind: "NAVIGATE_ACCEPTED",
      sessionId: task.sessionId,
      taskId: task.taskId,
      taskVersion: acceptRes.version,
    };
  }

  return { kind: "DENIED" };
}
