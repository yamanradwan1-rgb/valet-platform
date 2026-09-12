import type {
  CompleteHandoffResponse,
  StaffPaymentProjectionResponse,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { EmployeeReleaseSession } from "./employee-release-flow-session";
import {
  completion,
  payment,
  releaseDetail,
  releaseTask,
} from "./employee-release-flow-test-fixture";
import type { EmployeeReleaseTransport } from "./employee-release-flow-types";
import { handoffScope } from "./employee-handoff-flow-test-fixture";
import { ids } from "./employee-operational-test-fixture";
import {
  canonicalJourneyReads,
  journeyServer,
  restoreColdStartAuthority,
  type JourneyAuthority,
} from "./employee-process-death-journey-test-fixture";
import type {
  ProcessDeathCommandCut,
  ProtectedCommandFault,
  ProtectedCommandServer,
} from "./protected-command-process-death-test-fixture";
import { processDeathCommandCut } from "./protected-command-process-death-test-fixture";

function releaseTransport(
  server: ProtectedCommandServer<JourneyAuthority>,
  fault?: ProtectedCommandFault,
  cut?: ProcessDeathCommandCut,
): EmployeeReleaseTransport {
  return {
    ...canonicalJourneyReads(server),
    complete: async (): Promise<CompleteHandoffResponse> => {
      if (fault === undefined)
        throw new Error("Cold start must not complete handoff.");
      const operation = server.mutate("complete-handoff", fault, (state) => {
        state.session = releaseDetail({
          handoff: { pendingAt: null, verification: null },
          keySlot: null,
          state: "COMPLETED",
          version: completion().sessionVersion,
        });
        state.task = null;
        return completion();
      });
      return cut?.loseResponse(operation) ?? operation;
    },
    loadPayment: async (): Promise<StaffPaymentProjectionResponse> => payment(),
  };
}

describe("MOB-023B final release process death through production owner", () => {
  it.each(["before-commit", "commit-response-lost"] as const)(
    "uses current server truth after complete-handoff %s",
    async (fault) => {
      const server = journeyServer(releaseDetail(), releaseTask());
      const cut = processDeathCommandCut();
      let processA: EmployeeReleaseSession | undefined =
        new EmployeeReleaseSession({
          transport: releaseTransport(server, fault, cut),
        });
      await processA.openTask(1, handoffScope, ids.task, ids.session);
      expect(processA.current().phase).toBe("ready");
      void processA.release();
      await cut.reached;

      processA = undefined;
      const authorityB = await restoreColdStartAuthority(server, 2);
      const processB = new EmployeeReleaseSession({
        transport: releaseTransport(server),
      });
      const discovered = authorityB.tasks[0];
      if (fault === "before-commit") {
        expect(discovered).toBeDefined();
        await processB.openTask(
          2,
          authorityB.scope,
          discovered!.taskId,
          discovered!.sessionId,
        );
        expect(processB.current().phase).toBe("ready");
      } else {
        // Completion removes the active Task. A fresh shell remains on Tasks;
        // it does not resurrect Process A's release target or navigation.
        expect(discovered).toBeUndefined();
        expect(processB.current().phase).toBe("inactive");
        expect(server.canonicalRead("terminal-session").session).toMatchObject({
          handoff: { pendingAt: null, verification: null },
          keySlot: null,
          state: "COMPLETED",
          version: 9,
        });
      }
      expect(server.posts).toEqual(["complete-handoff"]);
      expect(JSON.stringify(processB.current())).not.toMatch(
        /pickupCode|qrPayload|vhq1\.|7391/,
      );
      authorityB.operations.dispose();
    },
  );
});
