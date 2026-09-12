import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { EmployeeConfirmParkedSession } from "./employee-confirm-parked-session";
import { EmployeeHandoffSession } from "./employee-handoff-flow-session";
import { EmployeeParkingStartSession } from "./employee-parking-start-session";
import { EmployeeReleaseSession } from "./employee-release-flow-session";
import { EmployeeRetrievalSession } from "./employee-retrieval-flow-session";
import {
  handoffDetail,
  handoffScope,
  handoffTask,
} from "./employee-handoff-flow-test-fixture";
import { ids } from "./employee-operational-test-fixture";
import {
  parkingStartDetail,
  parkingStartedResult,
  parkingStartScope,
  parkingStartTask,
} from "./employee-parking-start-test-fixture";
import { completion, payment } from "./employee-release-flow-test-fixture";
import {
  retrievalDetail,
  retrievalTask,
} from "./employee-retrieval-flow-test-fixture";
import { ProtectedCommandServer } from "./protected-command-process-death-test-fixture";

interface JourneyAuthority {
  session: StaffValetSessionDetailResponse;
  task: StaffTaskQueueItem | null;
}

function reads(server: ProtectedCommandServer<JourneyAuthority>) {
  return {
    loadSession: async () => server.canonicalRead("session").session,
    loadTaskQueue: async () => {
      const task = server.canonicalRead("queue").task;
      return { tasks: task === null ? [] : [task] };
    },
  };
}

async function committedWithoutResponse(
  server: ProtectedCommandServer<JourneyAuthority>,
  label: string,
  command: (state: JourneyAuthority) => void,
) {
  await expect(
    server.mutate(label, "commit-response-lost", (state) => {
      command(state);
      return undefined;
    }),
  ).rejects.toMatchObject({ isNetworkError: true });
}

describe("MOB-023B full-shift protected-command process death", () => {
  it("rehydrates each custody cut from canonical reads with zero cold-start POSTs", async () => {
    const server = new ProtectedCommandServer<JourneyAuthority>({
      session: parkingStartDetail(),
      task: null,
    });
    let coldStartPosts = 0;
    const rejectPost = () => {
      coldStartPosts += 1;
      return Promise.reject(new Error("Cold start attempted a mutation"));
    };

    await committedWithoutResponse(server, "queue-parking-task", (state) => {
      state.task = parkingStartTask({
        currentAssigneeMembershipId: null,
        status: "QUEUED",
        version: 1,
      });
    });
    const queueB = new EmployeeParkingStartSession({
      transport: {
        ...reads(server),
        queueParkingTask: rejectPost,
        startParking: rejectPost,
      },
    });
    await queueB.openQueueTask(1, parkingStartScope, ids.task, ids.session);
    expect(queueB.current().phase).toBe("assigned");
    server.commitExternal((state) => {
      state.task = parkingStartTask();
    });

    await committedWithoutResponse(server, "start-parking", (state) => {
      state.session = parkingStartDetail({
        parking: {
          parkedAt: null,
          parkingSpotCode: null,
          parkingStartedAt: parkingStartedResult().parkingStartedAt,
          parkingZoneCode: null,
        },
        state: "PARKING",
        version: 3,
      });
      state.task = parkingStartTask({
        status: "IN_PROGRESS",
        valetSessionState: "PARKING",
        valetSessionVersion: 3,
        version: 4,
      });
    });
    const parkingB = new EmployeeParkingStartSession({
      transport: {
        ...reads(server),
        queueParkingTask: rejectPost,
        startParking: rejectPost,
      },
    });
    await parkingB.openQueueTask(2, parkingStartScope, ids.task, ids.session);
    expect(parkingB.current().phase).toBe("started");

    await committedWithoutResponse(server, "confirm-parked", (state) => {
      state.session = {
        ...state.session,
        keySlot: { code: "K-03" },
        parking: {
          parkedAt: "2026-09-07T08:15:00.000Z",
          parkingSpotCode: "P-101",
          parkingStartedAt: parkingStartedResult().parkingStartedAt,
          parkingZoneCode: "A",
        },
        state: "PARKED",
        version: 4,
      };
      state.task = null;
    });
    const confirmB = new EmployeeConfirmParkedSession({
      transport: { ...reads(server), confirmParked: rejectPost },
    });
    await confirmB.open(3, parkingStartScope, ids.task, ids.session);
    expect(confirmB.current()).toMatchObject({
      parked: { keySlotCode: "K-03", parkingSpotCode: "P-101" },
      phase: "parked",
    });

    server.commitExternal((state) => {
      state.session = retrievalDetail();
      state.task = retrievalTask();
    });
    await committedWithoutResponse(server, "start-retrieval", (state) => {
      state.session = retrievalDetail({
        state: "RETRIEVING",
        version: 6,
      });
      state.task = retrievalTask({
        status: "IN_PROGRESS",
        valetSessionState: "RETRIEVING",
        valetSessionVersion: 6,
        version: 4,
      });
    });
    const retrievalStartB = new EmployeeRetrievalSession({
      transport: {
        ...reads(server),
        markReady: rejectPost,
        startRetrieval: rejectPost,
      },
    });
    await retrievalStartB.openQueueTask(4, handoffScope, ids.task, ids.session);
    expect(retrievalStartB.current().phase).toBe("retrieving");

    await committedWithoutResponse(server, "mark-ready", (state) => {
      state.session = retrievalDetail({
        state: "READY",
        version: 7,
      });
      state.task = retrievalTask({
        status: "IN_PROGRESS",
        valetSessionState: "READY",
        valetSessionVersion: 7,
        version: 4,
      });
    });
    const readyB = new EmployeeRetrievalSession({
      transport: {
        ...reads(server),
        markReady: rejectPost,
        startRetrieval: rejectPost,
      },
    });
    await readyB.openQueueTask(5, handoffScope, ids.task, ids.session);
    expect(readyB.current().phase).toBe("ready");

    await committedWithoutResponse(server, "initiate-handoff", (state) => {
      state.session = handoffDetail({
        handoff: {
          pendingAt: "2026-09-08T09:10:00.000Z",
          verification: null,
        },
        state: "HANDOFF_PENDING",
        version: 8,
      });
      state.task = handoffTask({
        valetSessionState: "HANDOFF_PENDING",
        valetSessionVersion: 8,
      });
    });
    const handoffTransport = {
      ...reads(server),
      abort: rejectPost,
      initiate: rejectPost,
      override: rejectPost,
      verifyDynamicQr: rejectPost,
      verifyPickupCode: rejectPost,
    };
    const handoffPendingB = new EmployeeHandoffSession({
      transport: handoffTransport,
    });
    await handoffPendingB.openTask(6, handoffScope, ids.task, ids.session);
    expect(handoffPendingB.current().phase).toBe("pending");

    const proofCanary = "4815";
    await committedWithoutResponse(server, "verify-pickup-code", (state) => {
      state.session = handoffDetail({
        handoff: {
          pendingAt: "2026-09-08T09:10:00.000Z",
          verification: {
            method: "PICKUP_CODE",
            status: "VERIFIED",
            verifiedAt: "2026-09-08T09:12:00.000Z",
          },
        },
        state: "HANDOFF_PENDING",
        version: 8,
      });
      state.task = handoffTask({
        valetSessionState: "HANDOFF_PENDING",
        valetSessionVersion: 8,
      });
    });
    const verifiedB = new EmployeeHandoffSession({
      transport: handoffTransport,
    });
    await verifiedB.openTask(7, handoffScope, ids.task, ids.session);
    expect(verifiedB.current().phase).toBe("verified");
    expect(JSON.stringify(server.canonicalRead("privacy"))).not.toContain(
      proofCanary,
    );

    await committedWithoutResponse(server, "abort-handoff", (state) => {
      state.session = handoffDetail();
      state.task = handoffTask();
    });
    const abortedB = new EmployeeHandoffSession({
      transport: handoffTransport,
    });
    await abortedB.openTask(8, handoffScope, ids.task, ids.session);
    expect(abortedB.current().phase).toBe("ready");

    server.commitExternal((state) => {
      state.session = handoffDetail({
        handoff: {
          pendingAt: "2026-09-08T09:20:00.000Z",
          verification: {
            method: "SUPERVISOR_OVERRIDE",
            status: "VERIFIED",
            verifiedAt: "2026-09-08T09:21:00.000Z",
          },
        },
        state: "HANDOFF_PENDING",
        version: 10,
      });
      state.task = handoffTask({
        valetSessionState: "HANDOFF_PENDING",
        valetSessionVersion: 10,
      });
    });
    await committedWithoutResponse(server, "complete-handoff", (state) => {
      state.session = {
        ...state.session,
        handoff: { pendingAt: null, verification: null },
        state: "COMPLETED",
        version: completion().sessionVersion,
      };
      state.task = null;
    });
    const releaseB = new EmployeeReleaseSession({
      transport: {
        ...reads(server),
        complete: rejectPost,
        loadPayment: async () => payment(),
      },
    });
    await releaseB.openTask(9, handoffScope, ids.task, ids.session);
    expect(releaseB.current().phase).toBe("released");
    expect(coldStartPosts).toBe(0);
    expect(server.posts).toHaveLength(9);
  });
});
