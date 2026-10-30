import { describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import type { EmployeeOperationalSnapshot } from "@valet/employee-client";
import { NativeTaskTrackingRuntime } from "../src/tracking/native-task-tracking-runtime";
import type { NativeTaskLocationPort } from "../src/tracking/native-task-location-adapter";
import { auth, operations, scope } from "./production-shell-test-fixture";

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

function eligible(
  count: number,
  move = movement,
  generation = 1,
): EmployeeOperationalSnapshot {
  return {
    ...operations("ready", { generation, retainedScope: scope }),
    successfulQueueSnapshotCount: count,
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
        taskType: "PARKING",
        valetSessionState: "PARKING",
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
    taskTracking: { movement: move, status: "ELIGIBLE" },
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function fixture() {
  let current = eligible(1);
  let identity = auth("authenticated");
  const operationListeners = new Set<() => void>();
  const authListeners = new Set<() => void>();
  const remove = vi.fn(() => {});
  const location = {
    ensureAccess: async () => ({ kind: "granted" as const }),
    inspectAccess: async () => ({ kind: "granted" as const }),
    openSettings: async () => {},
    remove,
    watchCalls: 0,
    async watch() {
      this.watchCalls += 1;
      return { remove };
    },
  } satisfies NativeTaskLocationPort & {
    watchCalls: number;
    remove: ReturnType<typeof vi.fn>;
  };
  const refreshQueue = vi.fn(async () => undefined);
  const runtime = new NativeTaskTrackingRuntime({
    auth: {
      current: () => identity,
      subscribe: (listener: () => void) => {
        authListeners.add(listener);
        listener();
        return () => void authListeners.delete(listener);
      },
    } as never,
    createId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    location,
    operations: {
      current: () => current,
      refreshQueue,
      subscribe: (listener: () => void) => {
        operationListeners.add(listener);
        listener();
        return () => void operationListeners.delete(listener);
      },
    } as never,
    transport: { upload: vi.fn() },
  });
  return {
    changeIdentity: (generation: number) => {
      identity = auth("authenticated", generation);
      authListeners.forEach((listener) => listener());
    },
    location,
    refreshQueue,
    runtime,
    update: (snapshot: EmployeeOperationalSnapshot) => {
      current = snapshot;
      operationListeners.forEach((listener) => listener());
    },
  };
}

describe("#401 lifecycle fences across background", () => {
  it("needs a fresh queue even if network reconnects while backgrounded", async () => {
    const s = fixture();
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchCalls).toBe(1);
    s.runtime.setOnline(false);
    expect(s.location.remove).toHaveBeenCalledOnce();
    s.runtime.setForeground(false);
    s.runtime.setOnline(true);
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchCalls).toBe(1);
    s.update(eligible(2));
    await settle();
    expect(s.location.watchCalls).toBe(2);
    s.runtime.dispose();
    expect(s.location.remove).toHaveBeenCalledTimes(2);
  });

  it("retains an unfinished completion fence during background restoration", async () => {
    const s = fixture();
    const completionListeners = new Set<
      (snapshot: { phase: string }) => void
    >();
    s.runtime.bindMovementCompletion(
      {
        current: () => ({ phase: "ready" }),
        subscribe: (listener: (snapshot: { phase: string }) => void) => {
          completionListeners.add(listener);
          return () => void completionListeners.delete(listener);
        },
      } as never,
      {
        current: () => ({ phase: "inactive" }),
        subscribe: () => () => {},
      } as never,
    );
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchCalls).toBe(1);
    completionListeners.forEach((listener) =>
      listener({ phase: "submitting" }),
    );
    expect(s.location.remove).toHaveBeenCalledOnce();
    s.runtime.setForeground(false);
    s.runtime.setForeground(true);
    completionListeners.forEach((listener) => listener({ phase: "ready" }));
    await settle();
    expect(s.refreshQueue).toHaveBeenCalledOnce();
    expect(s.location.watchCalls).toBe(1);
    s.update(eligible(2));
    await settle();
    expect(s.location.watchCalls).toBe(2);
    s.runtime.dispose();
  });

  it("clears a previous identity's network fence on auth-generation change", async () => {
    const s = fixture();
    s.runtime.setForeground(true);
    await settle();
    s.runtime.setOnline(false);
    s.runtime.setForeground(false);
    s.update(eligible(1, nextMovement, 2));
    s.changeIdentity(2);
    s.runtime.setOnline(true);
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchCalls).toBe(2);
    expect(s.location.remove).toHaveBeenCalledOnce();
    s.runtime.dispose();
  });
});
