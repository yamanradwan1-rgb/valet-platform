import { describe, expect, it } from "vitest";

import {
  canonicalJourneyReads,
  journeyServer,
  restoreColdStartAuthority,
  type JourneyAuthority,
} from "./employee-process-death-journey-test-fixture";
import { EmployeeRetrievalSession } from "./employee-retrieval-flow-session";
import {
  markReadyResult,
  retrievalDetail,
  retrievalScope,
  retrievalTask,
  startRetrievalResult,
} from "./employee-retrieval-flow-test-fixture";
import type {
  EmployeeRetrievalReadyResult,
  EmployeeRetrievalStartResult,
  EmployeeRetrievalTransport,
} from "./employee-retrieval-flow-types";
import { ids } from "./employee-operational-test-fixture";
import {
  faultCommitted,
  processDeathCommandCut,
  type ProcessDeathCommandCut,
  type ProtectedCommandFault,
  type ProtectedCommandServer,
  requiredProcessDeathFaults,
} from "./protected-command-process-death-test-fixture";

function retrievalTransport(
  server: ProtectedCommandServer<JourneyAuthority>,
  input: {
    ready?: ProtectedCommandFault;
    start?: ProtectedCommandFault;
  } = {},
  cut?: ProcessDeathCommandCut,
): EmployeeRetrievalTransport {
  return {
    ...canonicalJourneyReads(server),
    markReady: async (): Promise<EmployeeRetrievalReadyResult> => {
      if (input.ready === undefined)
        throw new Error("Unexpected Mark Ready POST.");
      const operation = server.mutate("mark-ready", input.ready, (state) => {
        const result = markReadyResult();
        state.session = retrievalDetail({
          state: "READY",
          version: result.sessionVersion,
        });
        state.task = retrievalTask({
          status: "IN_PROGRESS",
          valetSessionState: "READY",
          valetSessionVersion: result.sessionVersion,
          version: result.taskVersion,
        });
        return result;
      });
      return cut?.loseResponse(operation) ?? operation;
    },
    startRetrieval: async (): Promise<EmployeeRetrievalStartResult> => {
      if (input.start === undefined)
        throw new Error("Unexpected Start Retrieval POST.");
      const operation = server.mutate(
        "start-retrieval",
        input.start,
        (state) => {
          const result = startRetrievalResult();
          state.session = retrievalDetail({
            state: "RETRIEVING",
            version: result.sessionVersion,
          });
          state.task = retrievalTask({
            status: "IN_PROGRESS",
            valetSessionState: "RETRIEVING",
            valetSessionVersion: result.sessionVersion,
            version: result.taskVersion,
          });
          return result;
        },
      );
      return cut?.loseResponse(operation) ?? operation;
    },
  };
}

async function openDiscoveredRetrieval(
  server: ProtectedCommandServer<JourneyAuthority>,
  generation: number,
) {
  const authority = await restoreColdStartAuthority(server, generation);
  const task = authority.tasks[0];
  if (task === undefined) throw new Error("Expected current Retrieval Task.");
  const owner = new EmployeeRetrievalSession({
    transport: retrievalTransport(server),
  });
  await owner.openQueueTask(
    generation,
    authority.scope,
    task.taskId,
    task.sessionId,
  );
  return { authority, owner };
}

describe("MOB-023B Retrieval process death through production owners", () => {
  it.each(requiredProcessDeathFaults)(
    "resolves Start Retrieval %s from Process-B queue authority",
    async (fault) => {
      const server = journeyServer(retrievalDetail(), retrievalTask());
      const cut = processDeathCommandCut();
      let processA: EmployeeRetrievalSession | undefined =
        new EmployeeRetrievalSession({
          transport: retrievalTransport(server, { start: fault }, cut),
        });
      await processA.openQueueTask(1, retrievalScope, ids.task, ids.session);
      processA.enterKeySlot("K-9");
      expect(processA.confirmKeySlot()).toBe(true);
      void processA.startRetrieval();
      await cut.reached;

      processA = undefined;
      const { authority, owner: processB } = await openDiscoveredRetrieval(
        server,
        2,
      );
      expect(processB.current().phase).toBe(
        faultCommitted(fault) ? "retrieving" : "key-checkout",
      );
      expect(processB.current().keySlotCandidate).toBe("");
      expect(server.posts).toEqual(["start-retrieval"]);
      authority.operations.dispose();
    },
  );

  it("marks Ready through Process A and restores it with no POST", async () => {
    const server = journeyServer(
      retrievalDetail({ state: "RETRIEVING", version: 6 }),
      retrievalTask({
        status: "IN_PROGRESS",
        valetSessionState: "RETRIEVING",
        valetSessionVersion: 6,
        version: 4,
      }),
    );
    const cut = processDeathCommandCut();
    let processA: EmployeeRetrievalSession | undefined =
      new EmployeeRetrievalSession({
        transport: retrievalTransport(
          server,
          { ready: "commit-response-lost" },
          cut,
        ),
      });
    await processA.openQueueTask(1, retrievalScope, ids.task, ids.session);
    void processA.markReady();
    await cut.reached;

    processA = undefined;
    const { authority, owner: processB } = await openDiscoveredRetrieval(
      server,
      2,
    );
    expect(processB.current()).toMatchObject({
      keyConfirmed: false,
      keySlotCandidate: "",
      phase: "ready",
      session: { state: "READY", version: 7 },
    });
    expect(server.posts).toEqual(["mark-ready"]);
    authority.operations.dispose();
  });
});
