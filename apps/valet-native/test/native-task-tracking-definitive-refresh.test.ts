import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import type { TaskQueueWithTrackingResponse } from "@valet/contracts";
import {
  EmployeeApiError,
  EmployeeOperationalSession,
} from "@valet/employee-client";
import { NativeTaskTrackingRuntime } from "../src/tracking/native-task-tracking-runtime";
import type {
  NativeTaskLocationFix,
  NativeTaskLocationPort,
} from "../src/tracking/native-task-location-adapter";
import { auth, scope } from "./production-shell-test-fixture";

const now = Date.parse("2026-10-07T01:00:00.000Z");
const a = {
  sessionId: "55555555-5555-4555-8555-555555555555",
  taskId: "66666666-6666-4666-8666-666666666666",
  trackingSessionId: "77777777-7777-4777-8777-777777777777",
};
const b = {
  sessionId: "88888888-8888-4888-8888-888888888888",
  taskId: "99999999-9999-4999-8999-999999999999",
  trackingSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

function eligible(
  type: "PARKING" | "RETRIEVAL",
  ids: typeof a,
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
  readonly watchers: Array<{
    readonly onFix: (fix: NativeTaskLocationFix) => void;
    readonly remove: ReturnType<typeof vi.fn>;
  }> = [];
  async ensureAccess() {
    return { kind: "granted" as const };
  }
  async inspectAccess() {
    return { kind: "granted" as const };
  }
  async openSettings() {}
  async watch(onFix: (fix: NativeTaskLocationFix) => void) {
    const watcher = { onFix, remove: vi.fn() };
    this.watchers.push(watcher);
    return { remove: watcher.remove };
  }
  emit(index: number) {
    this.watchers[index]?.onFix({
      accuracyMeters: 8,
      latitude: 31.95,
      longitude: 35.91,
      timestamp: now,
    });
  }
}

function fixture(type: "PARKING" | "RETRIEVAL") {
  const oldQueue = eligible(type, a);
  const preTerminal = deferred<TaskQueueWithTrackingResponse>();
  const queueSignals: Array<AbortSignal | undefined> = [];
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
    loadTaskQueue: (_locationId: string, signal?: AbortSignal) => {
      queueSignals.push(signal);
      if (queueSignals.length === 1) return Promise.resolve(oldQueue);
      if (queueSignals.length === 2) return preTerminal.promise;
      return Promise.resolve(eligible(type, b));
    },
  };
  const operations = new EmployeeOperationalSession({
    initialForeground: true,
    pollingIntervalMs: 1_000_000,
    transport: transport as never,
  });
  const location = new FakeLocation();
  const upload = vi.fn(async () => {
    throw new EmployeeApiError({
      code: "TASK_INVALID_STATE",
      message: "Movement is already terminal",
      status: 409,
    });
  });
  const runtime = new NativeTaskTrackingRuntime({
    auth: {
      current: () => auth("authenticated"),
      subscribe: () => () => {},
    } as never,
    createId: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    location,
    now: () => now,
    operations,
    transport: { upload },
  });
  return {
    location,
    oldQueue,
    operations,
    preTerminal,
    queueSignals,
    runtime,
    upload,
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

describe("#401 definitive GPS rejection and queue freshness", () => {
  it.each(["PARKING", "RETRIEVAL"] as const)(
    "replaces preterminal %s queue GET after definitive 409 before trusting B",
    async (type) => {
      vi.useFakeTimers();
      const s = fixture(type);
      try {
        await s.operations.activate(1);
        s.runtime.setForeground(true);
        await settle();
        expect(s.location.watchers).toHaveLength(1);
        const oldRead = s.operations.refreshQueue();
        await settle();
        expect(s.queueSignals).toHaveLength(2);
        s.location.emit(0);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(s.upload).toHaveBeenCalledOnce();
        expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
        expect(s.queueSignals).toHaveLength(3);
        expect(s.queueSignals[1]?.aborted).toBe(true);
        s.preTerminal.resolve(s.oldQueue);
        await oldRead;
        await settle();
        expect(s.operations.current().taskTracking).toMatchObject({
          movement: { taskId: b.taskId },
          status: "ELIGIBLE",
        });
        expect(s.location.watchers).toHaveLength(2);
      } finally {
        s.preTerminal.resolve(s.oldQueue);
        s.runtime.dispose();
        s.operations.dispose();
      }
    },
  );
});
