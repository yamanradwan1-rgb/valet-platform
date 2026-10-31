import { describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import type { EmployeeOperationalSnapshot } from "@valet/employee-client";
import { NativeTaskTrackingRuntime } from "../src/tracking/native-task-tracking-runtime";
import type { NativeTaskLocationPort } from "../src/tracking/native-task-location-adapter";
import { auth, operations, scope } from "./production-shell-test-fixture";

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
  count: number,
): EmployeeOperationalSnapshot {
  return {
    ...operations("ready", { retainedScope: scope }),
    successfulQueueSnapshotCount: count,
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
    taskTracking: {
      movement: {
        ...ids,
        taskType: type,
        trackingStartedAt: "2026-10-07T00:59:59.000Z",
      },
      status: "ELIGIBLE",
    },
  };
}

class FakeLocation implements NativeTaskLocationPort {
  readonly watchers: Array<{ remove: ReturnType<typeof vi.fn> }> = [];
  async ensureAccess() {
    return { kind: "granted" as const };
  }
  async inspectAccess() {
    return { kind: "granted" as const };
  }
  async openSettings() {}
  async watch() {
    const watcher = { remove: vi.fn() };
    this.watchers.push(watcher);
    return watcher;
  }
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("#401 B-first before delayed terminal callback", () => {
  it.each([
    ["PARKING", "late-result"],
    ["RETRIEVAL", "late-result"],
    ["PARKING", "revalidation"],
    ["RETRIEVAL", "revalidation"],
  ] as const)(
    "keeps authorized %s B alive after A %s terminal event",
    async (type, ordering) => {
      let current = eligible(type, a, 1);
      const queueListeners = new Set<() => void>();
      const completionListeners = new Set<
        (snapshot: { phase: string }) => void
      >();
      const refreshQueue = vi.fn(async () => undefined);
      const location = new FakeLocation();
      const runtime = new NativeTaskTrackingRuntime({
        auth: {
          current: () => auth("authenticated"),
          subscribe: () => () => {},
        } as never,
        createId: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        location,
        operations: {
          current: () => current,
          refreshQueue,
          subscribe: (listener: () => void) => {
            queueListeners.add(listener);
            listener();
            return () => void queueListeners.delete(listener);
          },
        } as never,
        transport: { upload: vi.fn() },
      });
      const completion = {
        current: () => ({ phase: type === "PARKING" ? "ready" : "retrieving" }),
        subscribe: (listener: (snapshot: { phase: string }) => void) => {
          completionListeners.add(listener);
          return () => void completionListeners.delete(listener);
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
      runtime.setForeground(true);
      await settle();
      expect(location.watchers).toHaveLength(1);

      // A's HTTP command is in flight; server commits A terminal independently.
      completionListeners.forEach((listener) =>
        listener({
          phase: type === "PARKING" ? "submitting" : "submitting-ready",
        }),
      );
      expect(location.watchers[0]?.remove).toHaveBeenCalledOnce();
      const terminal = () =>
        completionListeners.forEach((listener) =>
          listener({ phase: type === "PARKING" ? "parked" : "ready" }),
        );
      if (ordering === "revalidation") terminal();
      current = eligible(type, b, 2); // Fresh server-authorized B arrives first.
      queueListeners.forEach((listener) => listener());
      await settle();
      expect(location.watchers).toHaveLength(2);
      expect(runtime.current()).toEqual({ kind: "active", taskType: type });

      if (ordering === "revalidation") {
        completionListeners.forEach((listener) =>
          listener({ phase: type === "PARKING" ? "reconciling" : "loading" }),
        );
      }
      terminal();
      await settle();
      expect(refreshQueue).toHaveBeenCalledWith(true);
      expect(location.watchers[1]?.remove).not.toHaveBeenCalled();
      expect(runtime.current()).toEqual({ kind: "active", taskType: type });
      current = eligible(type, a, 3); // A must remain quarantined on later stale truth.
      queueListeners.forEach((listener) => listener());
      await settle();
      expect(location.watchers).toHaveLength(2);
      expect(location.watchers[1]?.remove).toHaveBeenCalledOnce();
      current = eligible(type, b, 4);
      queueListeners.forEach((listener) => listener());
      await settle();
      expect(location.watchers).toHaveLength(3);
      expect(runtime.current()).toEqual({ kind: "active", taskType: type });
      runtime.dispose();
    },
  );
});
