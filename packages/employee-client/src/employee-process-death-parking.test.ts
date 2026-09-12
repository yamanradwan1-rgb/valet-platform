import type {
  ConfirmParkedResponse,
  ParkingTaskQueueResponse,
  StartParkingResponse,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { EmployeeConfirmParkedSession } from "./employee-confirm-parked-session";
import {
  activeParkingDetail,
  activeParkingTask,
  parkedDetail,
  parkedResponse,
} from "./employee-confirm-parked-test-fixture";
import {
  canonicalJourneyReads,
  journeyServer,
  restoreColdStartAuthority,
  type JourneyAuthority,
} from "./employee-process-death-journey-test-fixture";
import { EmployeeParkingStartSession } from "./employee-parking-start-session";
import {
  parkingStartDetail,
  parkingStartedResult,
  parkingStartScope,
  parkingStartTask,
} from "./employee-parking-start-test-fixture";
import type { EmployeeParkingStartTransport } from "./employee-parking-start-types";
import { ids } from "./employee-operational-test-fixture";
import {
  faultCommitted,
  processDeathCommandCut,
  type ProcessDeathCommandCut,
  type ProtectedCommandFault,
  type ProtectedCommandServer,
  requiredProcessDeathFaults,
} from "./protected-command-process-death-test-fixture";

function parkingTransport(
  server: ProtectedCommandServer<JourneyAuthority>,
  input: {
    queue?: ProtectedCommandFault;
    start?: ProtectedCommandFault;
  } = {},
  cut?: ProcessDeathCommandCut,
): EmployeeParkingStartTransport {
  return {
    ...canonicalJourneyReads(server),
    queueParkingTask: async (): Promise<ParkingTaskQueueResponse> => {
      if (input.queue === undefined)
        throw new Error("Unexpected queue Parking Task POST.");
      const operation = server.mutate(
        "queue-parking-task",
        input.queue,
        (state) => {
          const task = parkingStartTask({
            currentAssigneeMembershipId: null,
            status: "QUEUED",
            version: 1,
          });
          state.task = task;
          return {
            createdAt: task.createdAt,
            currentAssigneeMembershipId: task.currentAssigneeMembershipId,
            sessionId: task.sessionId,
            status: task.status,
            taskId: task.taskId,
            taskType: "PARKING" as const,
            version: task.version,
          };
        },
      );
      return cut?.loseResponse(operation) ?? operation;
    },
    startParking: async (): Promise<StartParkingResponse> => {
      if (input.start === undefined)
        throw new Error("Unexpected Start Parking POST.");
      const operation = server.mutate("start-parking", input.start, (state) => {
        const result = parkingStartedResult();
        state.session = parkingStartDetail({
          parking: {
            parkedAt: null,
            parkingSpotCode: null,
            parkingStartedAt: result.parkingStartedAt,
            parkingZoneCode: null,
          },
          state: "PARKING",
          version: result.sessionVersion,
        });
        state.task = parkingStartTask({
          status: "IN_PROGRESS",
          valetSessionState: "PARKING",
          valetSessionVersion: result.sessionVersion,
          version: result.taskVersion,
        });
        return result;
      });
      return cut?.loseResponse(operation) ?? operation;
    },
  };
}

function confirmTransport(
  server: ProtectedCommandServer<JourneyAuthority>,
  cut: ProcessDeathCommandCut,
) {
  return {
    ...canonicalJourneyReads(server),
    confirmParked: async (): Promise<ConfirmParkedResponse> => {
      const operation = server.mutate(
        "confirm-parked",
        "commit-response-lost",
        (state) => {
          state.session = parkedDetail();
          state.task = null;
          return parkedResponse();
        },
      );
      return cut.loseResponse(operation);
    },
  };
}

function faultName(fault: ProtectedCommandFault) {
  return typeof fault === "string"
    ? fault
    : `disconnect-${fault.commit ? "commit" : "no-commit"}`;
}

describe("MOB-023B Parking process death through production owners", () => {
  it("queues through Process A and lets Process B discover the Task", async () => {
    const server = journeyServer(parkingStartDetail(), null);
    const cut = processDeathCommandCut();
    let processA: EmployeeParkingStartSession | undefined =
      new EmployeeParkingStartSession({
        transport: parkingTransport(
          server,
          { queue: "commit-response-lost" },
          cut,
        ),
      });
    void processA.openCompletedCheckIn(1, parkingStartScope, ids.session);
    await cut.reached;

    processA = undefined;
    const authorityB = await restoreColdStartAuthority(server, 2);
    const discovered = authorityB.tasks[0];
    expect(discovered).toMatchObject({
      sessionId: ids.session,
      status: "QUEUED",
      taskType: "PARKING",
    });
    const processB = new EmployeeParkingStartSession({
      transport: parkingTransport(server),
    });
    await processB.openQueueTask(
      2,
      authorityB.scope,
      discovered!.taskId,
      discovered!.sessionId,
    );
    expect(processB.current().phase).toBe("assigned");
    expect(server.posts).toEqual(["queue-parking-task"]);
    authorityB.operations.dispose();
  });

  it.each(requiredProcessDeathFaults)(
    "resolves Start Parking %s from Process-B queue authority",
    async (fault) => {
      const server = journeyServer(parkingStartDetail(), parkingStartTask());
      const cut = processDeathCommandCut();
      let processA: EmployeeParkingStartSession | undefined =
        new EmployeeParkingStartSession({
          transport: parkingTransport(server, { start: fault }, cut),
        });
      await processA.openQueueTask(1, parkingStartScope, ids.task, ids.session);
      void processA.startParking();
      await cut.reached;

      processA = undefined;
      const authorityB = await restoreColdStartAuthority(server, 2);
      const discovered = authorityB.tasks[0];
      const processB = new EmployeeParkingStartSession({
        transport: parkingTransport(server),
      });
      await processB.openQueueTask(
        2,
        authorityB.scope,
        discovered!.taskId,
        discovered!.sessionId,
      );
      expect(processB.current().phase, faultName(fault)).toBe(
        faultCommitted(fault) ? "started" : "accepted",
      );
      expect(server.posts).toEqual(["start-parking"]);
      authorityB.operations.dispose();
    },
  );

  it("confirms through Process A, then cold-starts at Tasks with no target", async () => {
    const server = journeyServer(activeParkingDetail(), activeParkingTask());
    const cut = processDeathCommandCut();
    let processA: EmployeeConfirmParkedSession | undefined =
      new EmployeeConfirmParkedSession({
        transport: confirmTransport(server, cut),
      });
    await processA.open(1, parkingStartScope, ids.task, ids.session);
    processA.enterParkingSpot("P-101");
    processA.continueToKeySlot();
    processA.enterKeySlot("K-03");
    void processA.confirmParked();
    await cut.reached;

    processA = undefined;
    const authorityB = await restoreColdStartAuthority(server, 2);
    expect(authorityB.tasks).toEqual([]);
    expect(server.canonicalRead("completed-session").session).toMatchObject({
      keySlot: { code: "K-03" },
      parking: { parkingSpotCode: "P-101" },
      state: "PARKED",
    });
    expect(server.posts).toEqual(["confirm-parked"]);
    authorityB.operations.dispose();
  });
});
