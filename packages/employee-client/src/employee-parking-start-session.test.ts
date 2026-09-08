import type { StartParkingResponse, TaskQueueResponse } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeParkingStartSession } from "./employee-parking-start-session";
import {
  openParkingStart as open,
  parkingStartDetail as detail,
  parkingStartHarness as harness,
  parkingStartScope as scope,
  parkingStartedResult as startedResult,
  parkingStartTask as task,
  StubParkingStartTransport as StubParkingTransport,
} from "./employee-parking-start-test-fixture";
import { deferred, ids } from "./employee-operational-test-fixture";

describe("Employee Parking Start", () => {
  it("forwards the canonical session and both exact versions, then adopts the authoritative result", async () => {
    const { session, transport } = harness();
    await open(session);
    transport.startResults.push(Promise.resolve(startedResult()));
    await session.startParking();

    expect(transport.startCalls).toEqual([
      { sessionId: ids.session, sessionVersion: 2, taskVersion: 3 },
    ]);
    expect(session.current()).toMatchObject({
      phase: "started",
      session: { state: "PARKING", version: 3 },
      task: { status: "IN_PROGRESS", valetSessionVersion: 3, version: 4 },
    });
    expect(session.current().session?.parking).toMatchObject({
      parkedAt: null,
      parkingSpotCode: null,
      parkingZoneCode: null,
    });
  });

  it("coalesces rapid Start taps into one protected command", async () => {
    const { session, transport } = harness();
    await open(session);
    const pending = deferred<StartParkingResponse>();
    transport.startResults.push(pending.promise);
    const first = session.startParking();
    const second = session.startParking();
    expect(first).toBe(second);
    expect(transport.startCalls).toHaveLength(1);
    pending.resolve(startedResult());
    await first;
  });

  it("reconciles response loss to PARKING plus IN_PROGRESS without replay", async () => {
    const { session, transport } = harness();
    await open(session);
    transport.startResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          task({
            status: "IN_PROGRESS",
            valetSessionState: "PARKING",
            valetSessionVersion: 3,
            version: 4,
          }),
        ],
      }),
    );
    transport.sessionResults.push(
      Promise.resolve(
        detail({
          state: "PARKING",
          version: 3,
          parking: {
            ...detail().parking,
            parkingStartedAt: "2026-09-07T08:05:00.000Z",
          },
        }),
      ),
    );
    await session.startParking();
    expect(transport.startCalls).toHaveLength(1);
    expect(session.current().phase).toBe("started");
  });

  it("keeps a failed recovery read ambiguous and checks state without replay", async () => {
    const { session, transport } = harness();
    await open(session);
    transport.startResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(Promise.reject(employeeNetworkError()));
    await session.startParking();
    expect(session.current().phase).toBe("ambiguous");
    transport.queueResults.push(Promise.reject(employeeNetworkError()));
    await session.checkServerState();
    expect(transport.startCalls).toHaveLength(1);
  });

  it("offers only an explicit retry after recovery proves the pre-start state", async () => {
    const { session, transport } = harness();
    await open(session);
    transport.startResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(Promise.resolve({ tasks: [task()] }));
    transport.sessionResults.push(Promise.resolve(detail()));
    await session.startParking();
    expect(session.current().phase).toBe("accepted");
    expect(transport.startCalls).toHaveLength(1);
    transport.startResults.push(Promise.resolve(startedResult()));
    await session.startParking();
    expect(transport.startCalls).toHaveLength(2);
  });

  it.each([
    ["Task", task({ version: 4 }), detail()],
    ["session", task({ valetSessionVersion: 3 }), detail({ version: 3 })],
  ])(
    "refreshes after a stale %s version and does not resend automatically",
    async (_kind, refreshedTask, refreshedDetail) => {
      const { session, transport } = harness();
      await open(session);
      transport.startResults.push(
        Promise.reject(
          new EmployeeApiError({
            code: "VERSION_CONFLICT",
            message: "stale",
            status: 409,
          }),
        ),
      );
      transport.queueResults.push(Promise.resolve({ tasks: [refreshedTask] }));
      transport.sessionResults.push(Promise.resolve(refreshedDetail));
      await session.startParking();
      expect(transport.startCalls).toHaveLength(1);
      expect(session.current()).toMatchObject({
        phase: "accepted",
        task: { version: refreshedTask.version },
        session: { version: refreshedDetail.version },
      });
    },
  );

  it("does not bypass an ownership rejection", async () => {
    const { session, transport } = harness();
    await open(session);
    transport.startResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "TASK_NOT_FOUND_OR_FORBIDDEN",
          message: "hidden",
          status: 404,
        }),
      ),
    );
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          task({
            currentAssigneeMembershipId: "88888888-8888-4888-8888-888888888888",
          }),
        ],
      }),
    );
    transport.sessionResults.push(Promise.resolve(detail()));
    await session.startParking();
    expect(transport.startCalls).toHaveLength(1);
    expect(session.current().phase).toBe("conflict");
  });

  it("rejects task/session mismatch and ignores a late result after identity invalidation", async () => {
    const { session, transport } = harness();
    await open(session);
    const pending = deferred<StartParkingResponse>();
    transport.startResults.push(pending.promise);
    const operation = session.startParking();
    session.clear();
    pending.resolve(
      startedResult({ taskId: "99999999-9999-4999-8999-999999999999" }),
    );
    await operation;
    expect(session.current().phase).toBe("inactive");
  });

  it("does not accept a mismatched command result into the current task", async () => {
    const { session, transport } = harness();
    await open(session);
    transport.startResults.push(
      Promise.resolve(
        startedResult({ taskId: "99999999-9999-4999-8999-999999999999" }),
      ),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [task()] }));
    transport.sessionResults.push(Promise.resolve(detail()));
    await session.startParking();
    expect(transport.startCalls).toHaveLength(1);
    expect(session.current()).toMatchObject({
      phase: "accepted",
      task: { taskId: ids.task },
    });
  });

  it("fences a late read after the workflow task identity changes", async () => {
    const transport = new StubParkingTransport();
    const firstQueue = deferred<TaskQueueResponse>();
    transport.queueResults.push(
      firstQueue.promise,
      Promise.resolve({
        tasks: [
          task({
            sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            taskId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          }),
        ],
      }),
    );
    transport.sessionResults.push(
      Promise.resolve(
        detail({ sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      ),
    );
    const session = new EmployeeParkingStartSession({ transport });
    const old = session.openQueueTask(7, scope, ids.task, ids.session);
    await session.openQueueTask(
      7,
      scope,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    transport.sessionResults.push(Promise.resolve(detail()));
    firstQueue.resolve({ tasks: [task()] });
    await old;
    expect(session.current()).toMatchObject({
      phase: "accepted",
      session: { sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      task: { taskId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    });
  });

  it("keeps Task acceptance separate from physical Parking Start", async () => {
    const { session, transport } = harness(
      task({ status: "ASSIGNED", version: 2 }),
    );
    await open(session);
    expect(session.current().phase).toBe("assigned");
    await session.startParking();
    expect(transport.startCalls).toEqual([]);
  });

  it("treats an inconsistent pre-start Task status as a conflict", async () => {
    const { session, transport } = harness(task({ status: "IN_PROGRESS" }));
    await open(session);
    expect(session.current().phase).toBe("conflict");
    await session.startParking();
    expect(transport.startCalls).toEqual([]);
  });

  it("never treats a Retrieval Task as Parking Start authority", async () => {
    const { session, transport } = harness(task({ taskType: "RETRIEVAL" }));
    transport.sessionResults.length = 0;
    await open(session);
    expect(session.current().phase).toBe("unavailable");
    await session.startParking();
    expect(transport.startCalls).toEqual([]);
  });

  it("queues completed check-in into the same authoritative task workflow", async () => {
    const transport = new StubParkingTransport();
    const queued = task({
      currentAssigneeMembershipId: null,
      status: "QUEUED",
      version: 1,
    });
    transport.queueResults.push(Promise.resolve({ tasks: [queued] }));
    transport.sessionResults.push(Promise.resolve(detail()));
    transport.queuedResults.push(
      Promise.resolve({
        createdAt: "2026-09-07T08:01:00.000Z",
        currentAssigneeMembershipId: null,
        sessionId: ids.session,
        status: "QUEUED",
        taskId: ids.task,
        taskType: "PARKING",
        version: 1,
      }),
    );
    const session = new EmployeeParkingStartSession({ transport });
    await session.openCompletedCheckIn(7, scope, ids.session);
    expect(session.current()).toMatchObject({
      phase: "assigned",
      task: { status: "QUEUED", taskId: ids.task },
    });
  });
});
