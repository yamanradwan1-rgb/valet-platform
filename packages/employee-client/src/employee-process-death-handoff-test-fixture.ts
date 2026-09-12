import type {
  AbortHandoffResponse,
  InitiateHandoffResponse,
  VerifiedHandoffResponse,
} from "@valet/contracts";

import {
  handoffDetail,
  handoffTask,
  pendingDetail,
  pendingTask,
} from "./employee-handoff-flow-test-fixture";
import type { EmployeeHandoffTransport } from "./employee-handoff-flow-types";
import { ids } from "./employee-operational-test-fixture";
import {
  canonicalJourneyReads,
  type JourneyAuthority,
} from "./employee-process-death-journey-test-fixture";
import type {
  ProcessDeathCommandCut,
  ProtectedCommandFault,
  ProtectedCommandServer,
} from "./protected-command-process-death-test-fixture";

const pendingAt = "2026-09-08T09:10:00.000Z";
export const handoffVerifiedAt = "2026-09-08T09:12:00.000Z";
type HandoffCommand = "abort" | "initiate" | "override" | "pickup";

export function processDeathHandoffTransport(
  server: ProtectedCommandServer<JourneyAuthority>,
  command?: HandoffCommand,
  fault: ProtectedCommandFault = "commit-response-lost",
  expectedProof?: string,
  cut?: ProcessDeathCommandCut,
): EmployeeHandoffTransport {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected protected handoff POST.");
  };
  return {
    ...canonicalJourneyReads(server),
    abort:
      command === "abort"
        ? async (): Promise<AbortHandoffResponse> => {
            const operation = server.mutate("abort-handoff", fault, (state) => {
              const result = {
                sessionId: ids.session,
                sessionVersion: 10,
                state: "READY" as const,
                taskId: ids.task,
                taskStatus: "IN_PROGRESS" as const,
                taskVersion: 4,
              };
              state.session = handoffDetail({ state: "READY", version: 10 });
              state.task = handoffTask({
                valetSessionState: "READY",
                valetSessionVersion: 10,
              });
              return result;
            });
            return cut?.loseResponse(operation) ?? operation;
          }
        : unexpected,
    initiate:
      command === "initiate"
        ? async (): Promise<InitiateHandoffResponse> => {
            const operation = server.mutate(
              "initiate-handoff",
              fault,
              (state) => {
                const result = {
                  handoffPendingAt: pendingAt,
                  sessionId: ids.session,
                  sessionVersion: 8,
                  state: "HANDOFF_PENDING" as const,
                  taskId: ids.task,
                  taskStatus: "IN_PROGRESS" as const,
                  taskVersion: 4,
                };
                state.session = pendingDetail();
                state.task = pendingTask();
                return result;
              },
            );
            return cut?.loseResponse(operation) ?? operation;
          }
        : unexpected,
    override:
      command === "override"
        ? async (): Promise<VerifiedHandoffResponse> => {
            const operation = server.mutate(
              "supervisor-override",
              fault,
              (state) => {
                const result = verifiedResult("SUPERVISOR_OVERRIDE");
                state.session = verifiedDetail("SUPERVISOR_OVERRIDE");
                state.task = handoffTask({
                  currentAssigneeMembershipId:
                    "99999999-9999-4999-8999-999999999999",
                  valetSessionState: "HANDOFF_PENDING",
                  valetSessionVersion: 9,
                });
                return result;
              },
            );
            return cut?.loseResponse(operation) ?? operation;
          }
        : unexpected,
    verifyDynamicQr: unexpected,
    verifyPickupCode:
      command === "pickup"
        ? async (
            _sessionId,
            _version,
            proof,
          ): Promise<VerifiedHandoffResponse> => {
            if (proof !== expectedProof) throw new Error("Proof mismatch.");
            const operation = server.mutate(
              "verify-pickup-code",
              fault,
              (state) => {
                const result = verifiedResult("PICKUP_CODE");
                state.session = verifiedDetail("PICKUP_CODE");
                state.task = handoffTask({
                  valetSessionState: "HANDOFF_PENDING",
                  valetSessionVersion: 9,
                });
                return result;
              },
            );
            return cut?.loseResponse(operation) ?? operation;
          }
        : unexpected,
  };
}

function verifiedResult(
  method: "PICKUP_CODE" | "SUPERVISOR_OVERRIDE",
): VerifiedHandoffResponse {
  return {
    method,
    sessionId: ids.session,
    sessionVersion: 9,
    state: "HANDOFF_PENDING",
    taskId: ids.task,
    taskStatus: "IN_PROGRESS",
    taskVersion: 4,
    verificationStatus: "VERIFIED",
    verifiedAt: handoffVerifiedAt,
  };
}

function verifiedDetail(method: "PICKUP_CODE" | "SUPERVISOR_OVERRIDE") {
  return handoffDetail({
    handoff: {
      pendingAt,
      verification: {
        method,
        status: "VERIFIED",
        verifiedAt: handoffVerifiedAt,
      },
    },
    state: "HANDOFF_PENDING",
    version: 9,
  });
}
