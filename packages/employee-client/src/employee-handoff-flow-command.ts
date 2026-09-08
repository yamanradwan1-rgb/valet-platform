import type { HandoffStandardMethod } from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeHandoffSnapshot } from "./employee-handoff-flow-types";

export type EmployeeHandoffCommand =
  "abort" | "initiate" | "override" | "verify";

export function validateHandoffResult(
  command: EmployeeHandoffCommand,
  method: HandoffStandardMethod | "SUPERVISOR_OVERRIDE" | null,
  sessionId: string,
  version: number,
  taskId: string,
  taskVersion: number,
  result: {
    sessionId: string;
    sessionVersion: number;
    state: string;
    taskId: string;
    taskStatus: string;
    taskVersion: number;
    method?: string;
  },
) {
  const expectedState = command === "abort" ? "READY" : "HANDOFF_PENDING";
  if (
    result.sessionId !== sessionId ||
    result.sessionVersion !== version + 1 ||
    result.state !== expectedState ||
    result.taskId !== taskId ||
    result.taskStatus !== "IN_PROGRESS" ||
    result.taskVersion !== taskVersion ||
    ((command === "verify" || command === "override") &&
      result.method !== method)
  ) {
    throw new EmployeeApiError({
      code: "HANDOFF_RESPONSE_MISMATCH",
      message: "The handoff result did not match current work.",
      status: 502,
    });
  }
}

export function applyHandoffResult(
  snapshot: EmployeeHandoffSnapshot,
  command: EmployeeHandoffCommand,
  result: {
    handoffPendingAt?: string;
    method?: "PICKUP_CODE" | "DYNAMIC_QR" | "SUPERVISOR_OVERRIDE";
    sessionVersion: number;
    state: "READY" | "HANDOFF_PENDING";
    verifiedAt?: string;
  },
): EmployeeHandoffSnapshot {
  const session = snapshot.session!;
  const task = snapshot.task!;
  const verified = command === "verify" || command === "override";
  return {
    ...snapshot,
    failure: null,
    phase: command === "abort" ? "ready" : verified ? "verified" : "pending",
    session: {
      ...session,
      handoff:
        command === "abort"
          ? { pendingAt: null, verification: null }
          : {
              pendingAt: result.handoffPendingAt ?? session.handoff.pendingAt,
              verification: verified
                ? {
                    method: result.method!,
                    status: "VERIFIED",
                    verifiedAt: result.verifiedAt!,
                  }
                : null,
            },
      state: result.state,
      version: result.sessionVersion,
    },
    task: {
      ...task,
      valetSessionState: result.state,
      valetSessionVersion: result.sessionVersion,
    },
  };
}
