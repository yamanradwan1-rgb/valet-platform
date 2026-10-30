import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import type { TaskQueueWithTrackingResponse } from "@valet/contracts";
import { EmployeeOperationalSession } from "@valet/employee-client";
import { NativeTaskTrackingRuntime } from "../src/tracking/native-task-tracking-runtime";
import type { NativeTaskLocationPort } from "../src/tracking/native-task-location-adapter";
import { auth, scope } from "./production-shell-test-fixture";

const movementIds = {
  sessionId: "55555555-5555-4555-8555-555555555555",
  taskId: "66666666-6666-4666-8666-666666666666",
  trackingSessionId: "77777777-7777-4777-8777-777777777777",
};
const nextMovementIds = {
  sessionId: "88888888-8888-4888-8888-888888888888",
  taskId: "99999999-9999-4999-8999-999999999999",
  trackingSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

function eligibleQueue(
  type: "PARKING" | "RETRIEVAL",
  ids = movementIds,
): TaskQueueWithTrackingResponse {
  return {
    tasks: [
      {
        createdAt: "2026-10-07T00:59:00.000Z",
        currentAssigneeMembershipId: scope.membershipId,
        parkingSpot: null,
        parkingZone: null,
        retrievalRequestedAt:
          type === "RETRIEVAL" ? "2026-10-07T00:58:00.000Z" : null,
        sessionId: ids.sessionId,
        status: "IN_PROGRESS",
        taskId: ids.taskId,
        taskType: type,
        valetSessionState: type === "PARKING" ? "PARKING" : "RETRIEVING",
        valetSessionVersion: 2,
        vehicle: {
          color: null,
          make: null,
          model: null,
          plateNumberRaw: null,
          temporaryDescriptor: null,
        },
        version: 3,
      },
    ],
    tracking: {
      movement: {
        ...ids,
        taskType: type,
        trackingStartedAt: "2026-10-07T00:59:59.000Z",
      },
      status: "ELIGIBLE",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class FakeLocation implements NativeTaskLocationPort {
  readonly removed = vi.fn();
  watchCalls = 0;
  async ensureAccess() {
    return { kind: "granted" as const };
  }
  async inspectAccess() {
    return { kind: "granted" as const };
  }
  async openSettings() {}
  async watch() {
    this.watchCalls += 1;
    return { remove: this.removed };
  }
}

function fixture(type: "PARKING" | "RETRIEVAL", delayTerminalQueue = false) {
  const preTerminalQueue = deferred<TaskQueueWithTrackingResponse>();
  const postTerminalQueue = deferred<TaskQueueWithTrackingResponse>();
  const oldQueue = eligibleQueue(type);
  const queueSignals: Array<AbortSignal | undefined> = [];
  const location = new FakeLocation();
  const authListeners = new Set<() => void>();
  const locationInfo = {
    code: scope.locationCode,
    currency: "JOD",
    locationId: scope.locationId,
    name: scope.locationName,
    timezone: "Asia/Amman",
  };
  const transport = {
    acceptTask: vi.fn(),
    assignTask: vi.fn(),
    loadOperationalContext: async () => ({
      contexts: [
        {
          activeShift: {
            locationId: scope.locationId,
            shiftId: scope.shiftId,
            startedAt: scope.shiftStartedAt,
            status: "ACTIVE",
          },
          currentLocation: locationInfo,
          eligibleLocations: [locationInfo],
          membershipId: scope.membershipId,
          organization: {
            name: scope.organizationName,
            organizationId: scope.organizationId,
          },
          role: scope.role,
        },
      ],
    }),
    loadTaskQueue: (_locationId: string, signal?: AbortSignal) => {
      queueSignals.push(signal);
      if (queueSignals.length === 1) return Promise.resolve(oldQueue);
      if (queueSignals.length === 2) return preTerminalQueue.promise;
      if (delayTerminalQueue) return postTerminalQueue.promise;
      return Promise.resolve({
        tasks: [],
        tracking: { status: "NONE" as const },
      });
    },
  };
  const operations = new EmployeeOperationalSession({
    initialForeground: true,
    pollingIntervalMs: 1_000_000,
    transport: transport as never,
  });
  const runtime = new NativeTaskTrackingRuntime({
    auth: {
      current: () => auth("authenticated"),
      subscribe: (listener: () => void) => {
        authListeners.add(listener);
        listener();
        return () => void authListeners.delete(listener);
      },
    } as never,
    createId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    location,
    now: () => Date.parse("2026-10-07T01:00:00.000Z"),
    operations,
    transport: { upload: vi.fn() },
  });
  const listeners = new Set<(snapshot: { phase: string }) => void>();
  const completion = {
    current: () => ({ phase: type === "PARKING" ? "ready" : "retrieving" }),
    subscribe: (listener: (snapshot: { phase: string }) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const inert = {
    current: () => ({ phase: "inactive" }),
    subscribe: () => () => {},
  };
  runtime.bindMovementCompletion(
    (type === "PARKING" ? completion : inert) as never,
    (type === "RETRIEVAL" ? completion : inert) as never,
  );
  return {
    authNotify: () => authListeners.forEach((listener) => listener()),
    complete: () => {
      listeners.forEach((listener) =>
        listener({
          phase: type === "PARKING" ? "submitting" : "submitting-ready",
        }),
      );
      listeners.forEach((listener) =>
        listener({
          phase: type === "PARKING" ? "parked" : "ready",
        }),
      );
    },
    repeatTerminal: () =>
      listeners.forEach((listener) =>
        listener({ phase: type === "PARKING" ? "parked" : "ready" }),
      ),
    location,
    oldQueue,
    operations,
    postTerminalQueue,
    preTerminalQueue,
    queueSignals,
    runtime,
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

describe("#401 terminal completion pending queue recovery", () => {
  it.each(["PARKING", "RETRIEVAL"] as const)(
    "does not revive %s A from a pre-terminal in-flight queue GET",
    async (type) => {
      const s = fixture(type);
      await s.operations.activate(1);
      s.runtime.setForeground(true);
      await settle();
      expect(s.location.watchCalls).toBe(1);

      const preTerminalRead = s.operations.refreshQueue();
      await settle();
      expect(s.queueSignals).toHaveLength(2);
      s.complete();
      expect(s.location.removed).toHaveBeenCalledOnce();
      expect(s.queueSignals).toHaveLength(3); // Terminal refresh replaced the old GET.
      expect(s.queueSignals[1]?.aborted).toBe(true);
      s.authNotify(); // Stale local ELIGIBLE snapshot must not rearm A.
      s.preTerminalQueue.resolve(s.oldQueue);
      await preTerminalRead;
      await settle();
      expect(s.location.watchCalls).toBe(1);
      expect(s.operations.current().taskTracking).toEqual({ status: "NONE" });
      s.runtime.dispose();
      s.operations.dispose();
    },
  );

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "keeps terminal %s A blocked across foreground restoration before fresh queue",
    async (type) => {
      const s = fixture(type, true);
      await s.operations.activate(1);
      s.runtime.setForeground(true);
      await settle();
      expect(s.location.watchCalls).toBe(1);
      const preTerminalRead = s.operations.refreshQueue();
      await settle();
      s.complete();
      expect(s.location.removed).toHaveBeenCalledOnce();
      expect(s.queueSignals[1]?.aborted).toBe(true);
      s.runtime.setForeground(false);
      s.runtime.setForeground(true);
      s.authNotify();
      await settle();
      expect(s.location.watchCalls).toBe(1);
      s.preTerminalQueue.resolve(s.oldQueue);
      await preTerminalRead;
      s.postTerminalQueue.resolve({ tasks: [], tracking: { status: "NONE" } });
      await settle();
      expect(s.location.watchCalls).toBe(1);
      s.runtime.dispose();
      s.operations.dispose();
    },
  );

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "does not retire valid new %s B on a repeated old terminal callback",
    async (type) => {
      const s = fixture(type, true);
      await s.operations.activate(1);
      s.runtime.setForeground(true);
      await settle();
      const preTerminalRead = s.operations.refreshQueue();
      await settle();
      s.complete();
      s.postTerminalQueue.resolve(eligibleQueue(type, nextMovementIds));
      await settle();
      expect(s.location.watchCalls).toBe(2);
      s.repeatTerminal();
      await settle();
      expect(s.location.watchCalls).toBe(2);
      expect(s.location.removed).toHaveBeenCalledOnce();
      s.preTerminalQueue.resolve(s.oldQueue);
      await preTerminalRead;
      s.runtime.dispose();
      s.operations.dispose();
    },
  );
});
