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
  ids = a,
  successfulQueueSnapshotCount = 1,
): EmployeeOperationalSnapshot {
  return {
    ...operations("ready", { retainedScope: scope }),
    successfulQueueSnapshotCount,
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

function fixture(type: "PARKING" | "RETRIEVAL") {
  let current = eligible(type);
  const listeners = new Set<() => void>();
  const completionListeners = new Set<(snapshot: unknown) => void>();
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
        listeners.add(listener);
        listener();
        return () => void listeners.delete(listener);
      },
    } as never,
    transport: { upload: vi.fn() },
  });
  const completion = {
    current: () => ({ phase: type === "PARKING" ? "spot" : "retrieving" }),
    subscribe: (listener: (snapshot: unknown) => void) => {
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
  return {
    location,
    refreshQueue,
    runtime,
    failQueue: () => {
      current = {
        ...current,
        queueFailure: {
          code: "QUEUE_UNAVAILABLE",
          message: "Temporary failure",
        },
        taskTracking: null,
      };
      listeners.forEach((listener) => listener());
    },
    loseProjection: () => {
      current = { ...current, taskTracking: null };
      listeners.forEach((listener) => listener());
    },
    serverTerminal: (ids = a) =>
      completionListeners.forEach((listener) =>
        listener({
          phase: type === "PARKING" ? "parked" : "ready",
          identityGeneration: 1,
          scope,
          session: { sessionId: ids.sessionId },
          task: type === "RETRIEVAL" ? { taskId: ids.taskId } : null,
        }),
      ),
    update: (ids: typeof a, count = 2) => {
      current = eligible(type, ids, count);
      listeners.forEach((listener) => listener());
    },
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("#401 canonical server terminal without local submission", () => {
  it.each(["PARKING", "RETRIEVAL"] as const)(
    "keeps %s A terminal quarantined after context temporarily drops projection",
    async (type) => {
      const s = fixture(type);
      s.runtime.setForeground(true);
      await settle();
      s.loseProjection();
      expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
      s.serverTerminal();
      s.update(a, 2);
      await settle();
      expect(s.location.watchers).toHaveLength(1);
      s.update(b, 3);
      await settle();
      expect(s.location.watchers).toHaveLength(2);
      s.runtime.dispose();
    },
  );

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "quarantines server-terminal %s A when queue failure removed its projection",
    async (type) => {
      const s = fixture(type);
      s.runtime.setForeground(true);
      await settle();
      expect(s.location.watchers).toHaveLength(1);
      s.failQueue(); // Queue failure drops taskTracking; publisher retains A.
      expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
      s.serverTerminal();
      s.update(a, 2); // Older pre-terminal A queue result arrives after completion.
      await settle();
      expect(s.location.watchers).toHaveLength(1);
      expect(s.refreshQueue).toHaveBeenCalledWith(true);
      s.update(b, 3);
      await settle();
      expect(s.location.watchers).toHaveLength(2);
      expect(s.runtime.current()).toEqual({ kind: "active", taskType: type });
      s.runtime.dispose();
    },
  );

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "does not quarantine %s B after queue failure from old A terminal",
    async (type) => {
      const s = fixture(type);
      s.runtime.setForeground(true);
      await settle();
      s.update(b, 2);
      await settle();
      expect(s.location.watchers).toHaveLength(2);
      s.failQueue(); // Last authoritative movement was B, not A.
      s.serverTerminal(a);
      s.update(b, 3);
      await settle();
      expect(s.location.watchers).toHaveLength(3);
      expect(s.runtime.current()).toEqual({ kind: "active", taskType: type });
      s.runtime.dispose();
    },
  );

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "stops current %s A immediately on server terminal without local submitting",
    async (type) => {
      const s = fixture(type);
      s.runtime.setForeground(true);
      await settle();
      expect(s.location.watchers).toHaveLength(1);
      s.serverTerminal();
      expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
      expect(s.refreshQueue).toHaveBeenCalledWith(true);
      s.runtime.dispose();
    },
  );

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "quarantines %s A when terminal arrives with no live watcher",
    async (type) => {
      const s = fixture(type);
      s.runtime.setForeground(true);
      await settle();
      s.runtime.setForeground(false);
      expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
      s.serverTerminal();
      s.runtime.setForeground(true);
      await settle();
      expect(s.location.watchers).toHaveLength(1);
      s.runtime.dispose();
    },
  );

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "never stops distinct %s B from an old A server terminal",
    async (type) => {
      const s = fixture(type);
      s.runtime.setForeground(true);
      await settle();
      s.update(b);
      await settle();
      expect(s.location.watchers).toHaveLength(2);
      s.serverTerminal(a);
      expect(s.location.watchers[1]?.remove).not.toHaveBeenCalled();
      s.runtime.dispose();
    },
  );
});
