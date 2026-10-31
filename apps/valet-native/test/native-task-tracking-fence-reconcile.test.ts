import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import type {
  EmployeeGpsSample,
  EmployeeOperationalSnapshot,
} from "@valet/employee-client";
import { NativeTaskTrackingRuntime } from "../src/tracking/native-task-tracking-runtime";
import type {
  NativeTaskLocationFix,
  NativeTaskLocationPort,
} from "../src/tracking/native-task-location-adapter";
import { auth, operations, scope } from "./production-shell-test-fixture";

const now = Date.parse("2026-10-07T01:00:00.000Z");
const movement = {
  sessionId: "55555555-5555-4555-8555-555555555555",
  taskId: "66666666-6666-4666-8666-666666666666",
  trackingSessionId: "77777777-7777-4777-8777-777777777777",
  taskType: "PARKING" as const,
  trackingStartedAt: "2026-10-07T00:59:59.000Z",
};
const nextMovement = {
  ...movement,
  sessionId: "88888888-8888-4888-8888-888888888888",
  taskId: "99999999-9999-4999-8999-999999999999",
  trackingSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

function snapshot(
  move: typeof movement,
  successfulQueueSnapshotCount: number,
): EmployeeOperationalSnapshot {
  return {
    ...operations("ready", { retainedScope: scope }),
    successfulQueueSnapshotCount,
    taskTracking: { movement: move, status: "ELIGIBLE" },
    tasks: [
      {
        createdAt: "2026-10-07T00:59:00.000Z",
        currentAssigneeMembershipId: scope.membershipId,
        parkingSpot: null,
        parkingZone: null,
        retrievalRequestedAt: null,
        sessionId: move.sessionId,
        status: "IN_PROGRESS",
        taskId: move.taskId,
        taskType: move.taskType,
        valetSessionState: "PARKING",
        valetSessionVersion: 1,
        vehicle: {
          color: null,
          make: null,
          model: null,
          plateNumberRaw: null,
          temporaryDescriptor: null,
        },
        version: 1,
      },
    ],
  };
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
  emit(index: number, latitude: number) {
    this.watchers[index]?.onFix({
      accuracyMeters: 8,
      latitude,
      longitude: 35.9,
      timestamp: now,
    });
  }
}

function fixture() {
  const location = new FakeLocation();
  let current = snapshot(movement, 1);
  const listeners = new Set<() => void>();
  const refreshQueue = vi.fn(async () => undefined);
  const upload = vi.fn(
    async (_sessionId: string, samples: readonly EmployeeGpsSample[]) => ({
      samples: samples.map((sample) => ({
        clientSampleId: sample.clientSampleId,
        status: "ACCEPTED" as const,
      })),
    }),
  );
  let nextId = 0;
  const runtime = new NativeTaskTrackingRuntime({
    auth: {
      current: () => auth("authenticated"),
      subscribe: (listener: () => void) => {
        listener();
        return () => {};
      },
    } as never,
    createId: () =>
      `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
    location,
    now: () => now,
    operations: {
      current: () => current,
      refreshQueue,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        listener();
        return () => void listeners.delete(listener);
      },
    } as never,
    transport: { upload },
  });
  return {
    location,
    refreshQueue,
    runtime,
    upload,
    update: (next: EmployeeOperationalSnapshot) => {
      current = next;
      listeners.forEach((listener) => listener());
    },
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

describe("#401 fresh queue fence reconciliation", () => {
  it("starts a distinct eligible B on the first fresh network-recovery snapshot and ignores late A fixes", async () => {
    vi.useFakeTimers();
    const s = fixture();
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchers).toHaveLength(1);

    s.runtime.setOnline(false);
    expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
    s.update(snapshot(nextMovement, 1));
    s.runtime.setOnline(true);
    await settle();
    expect(s.location.watchers).toHaveLength(1);
    expect(s.upload).not.toHaveBeenCalled();

    s.update(snapshot(nextMovement, 2));
    await settle();
    expect(s.location.watchers).toHaveLength(2);
    expect(s.runtime.current()).toEqual({
      kind: "active",
      taskType: "PARKING",
    });
    s.location.emit(0, 31.1); // A's retained OS callback must be inert.
    s.location.emit(1, 32.2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.upload).toHaveBeenCalledOnce();
    expect(s.upload.mock.calls[0]?.[0]).toBe(nextMovement.sessionId);
    expect(s.upload.mock.calls[0]?.[1]).toMatchObject([{ latitude: 32.2 }]);
    s.runtime.dispose();
    expect(s.location.watchers[1]?.remove).toHaveBeenCalledOnce();
  });

  it("starts a distinct eligible B on the first fresh completion-recovery snapshot", async () => {
    const s = fixture();
    type Phase = "ready" | "submitting";
    let phase: Phase = "ready";
    const listeners = new Set<(value: { phase: Phase }) => void>();
    s.runtime.bindMovementCompletion(
      {
        current: () => ({ phase }),
        subscribe: (listener: (value: { phase: Phase }) => void) => {
          listeners.add(listener);
          listener({ phase });
          return () => void listeners.delete(listener);
        },
      } as never,
      {
        current: () => ({ phase: "inactive" }),
        subscribe: () => () => {},
      } as never,
    );
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchers).toHaveLength(1);
    phase = "submitting";
    listeners.forEach((listener) => listener({ phase }));
    expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
    phase = "ready";
    listeners.forEach((listener) => listener({ phase }));
    expect(s.refreshQueue).toHaveBeenCalledOnce();
    s.update(snapshot(nextMovement, 1));
    await settle();
    expect(s.location.watchers).toHaveLength(1);

    s.update(snapshot(nextMovement, 2));
    await settle();
    expect(s.location.watchers).toHaveLength(2);
    expect(s.runtime.current()).toEqual({
      kind: "active",
      taskType: "PARKING",
    });
    s.runtime.dispose();
    expect(s.location.watchers[1]?.remove).toHaveBeenCalledOnce();
  });

  it("clears simultaneous network and completion fences in one fresh authoritative B snapshot", async () => {
    const s = fixture();
    const listeners = new Set<(value: { phase: string }) => void>();
    s.runtime.bindMovementCompletion(
      {
        current: () => ({ phase: "ready" }),
        subscribe: (listener: (value: { phase: string }) => void) => {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
      } as never,
      {
        current: () => ({ phase: "inactive" }),
        subscribe: () => () => {},
      } as never,
    );
    s.runtime.setForeground(true);
    await settle();
    s.runtime.setOnline(false);
    listeners.forEach((listener) => listener({ phase: "submitting" }));
    expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
    s.update(snapshot(nextMovement, 1));
    s.runtime.setOnline(true);
    await settle();
    expect(s.location.watchers).toHaveLength(1);

    s.update(snapshot(nextMovement, 2));
    await settle();
    expect(s.location.watchers).toHaveLength(2);
    expect(s.runtime.current()).toEqual({
      kind: "active",
      taskType: "PARKING",
    });
    s.runtime.dispose();
  });

  it("does not revive A from a stale queue after local confirmed PARKED completion", async () => {
    const s = fixture();
    const listeners = new Set<(value: { phase: string }) => void>();
    s.runtime.bindMovementCompletion(
      {
        current: () => ({ phase: "ready" }),
        subscribe: (listener: (value: { phase: string }) => void) => {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
      } as never,
      {
        current: () => ({ phase: "inactive" }),
        subscribe: () => () => {},
      } as never,
    );
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchers).toHaveLength(1);
    listeners.forEach((listener) => listener({ phase: "submitting" }));
    expect(s.location.watchers[0]?.remove).toHaveBeenCalledOnce();
    listeners.forEach((listener) => listener({ phase: "parked" }));
    expect(s.refreshQueue).toHaveBeenCalledOnce();
    s.runtime.retry(); // A's old ELIGIBLE queue is still waiting for refresh.
    await settle();
    expect(s.location.watchers).toHaveLength(1);
    expect(s.upload).not.toHaveBeenCalled();
    s.runtime.dispose();
  });
});
