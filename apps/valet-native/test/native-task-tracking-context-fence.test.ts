import { describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import type { TaskQueueWithTrackingResponse } from "@valet/contracts";
import { EmployeeOperationalSession } from "@valet/employee-client";
import { NativeTaskTrackingRuntime } from "../src/tracking/native-task-tracking-runtime";
import type { NativeTaskLocationPort } from "../src/tracking/native-task-location-adapter";
import { auth, scope } from "./production-shell-test-fixture";

const ids = {
  sessionId: "55555555-5555-4555-8555-555555555555",
  taskId: "66666666-6666-4666-8666-666666666666",
  trackingSessionId: "77777777-7777-4777-8777-777777777777",
};

function eligibleQueue(
  type: "PARKING" | "RETRIEVAL",
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

function fixture(type: "PARKING" | "RETRIEVAL") {
  const terminalQueue = deferred<TaskQueueWithTrackingResponse>();
  const location = new FakeLocation();
  let queueReads = 0;
  let authState = auth("authenticated");
  const authListeners = new Set<() => void>();
  const locationInfo = {
    code: scope.locationCode,
    currency: "JOD",
    locationId: scope.locationId,
    name: scope.locationName,
    timezone: "Asia/Amman",
  };
  const transport = {
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
    loadTaskQueue: () => {
      queueReads += 1;
      return queueReads === 1
        ? Promise.resolve(eligibleQueue(type))
        : terminalQueue.promise;
    },
  };
  const operations = new EmployeeOperationalSession({
    initialForeground: true,
    pollingIntervalMs: 1_000_000,
    transport: transport as never,
  });
  const runtime = new NativeTaskTrackingRuntime({
    auth: {
      current: () => authState,
      subscribe: (listener: () => void) => {
        authListeners.add(listener);
        listener();
        return () => void authListeners.delete(listener);
      },
    } as never,
    createId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    location,
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
    location,
    operations,
    runtime,
    terminalQueue,
    finish: () => {
      listeners.forEach((listener) =>
        listener({
          phase: type === "PARKING" ? "submitting" : "submitting-ready",
        }),
      );
      listeners.forEach((listener) =>
        listener({ phase: type === "PARKING" ? "parked" : "ready" }),
      );
    },
    transientAuth: () => {
      authState = auth("restoration-unavailable");
      authListeners.forEach((listener) => listener());
      authState = auth("authenticated");
      authListeners.forEach((listener) => listener());
    },
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("#401 terminal quarantine during temporary state loss", () => {
  it.each(["PARKING", "RETRIEVAL"] as const)(
    "keeps %s A blocked across same-scope operational context refresh",
    async (type) => {
      const s = fixture(type);
      await s.operations.activate(1);
      s.runtime.setForeground(true);
      await settle();
      expect(s.location.watchCalls).toBe(1);
      s.finish();
      expect(s.location.removed).toHaveBeenCalledOnce();
      const contextRefresh = s.operations.refresh();
      await settle();
      expect(s.operations.current().phase).toBe("ready");
      expect(s.operations.current().successfulQueueSnapshotCount).toBe(1);
      expect(s.location.watchCalls).toBe(1);
      s.terminalQueue.resolve({ tasks: [], tracking: { status: "NONE" } });
      await contextRefresh;
      s.runtime.dispose();
      s.operations.dispose();
    },
  );

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "keeps %s A blocked across transient same-generation auth loss",
    async (type) => {
      const s = fixture(type);
      await s.operations.activate(1);
      s.runtime.setForeground(true);
      await settle();
      s.finish();
      s.transientAuth();
      await settle();
      expect(s.location.watchCalls).toBe(1);
      s.terminalQueue.resolve({ tasks: [], tracking: { status: "NONE" } });
      await settle();
      s.runtime.dispose();
      s.operations.dispose();
    },
  );
});
