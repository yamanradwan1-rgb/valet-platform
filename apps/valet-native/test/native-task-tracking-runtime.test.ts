import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import type {
  EmployeeGpsSample,
  EmployeeOperationalSnapshot,
} from "@valet/employee-client";
import { NativeTaskTrackingRuntime } from "../src/tracking/native-task-tracking-runtime";
import type {
  NativeTaskLocationAccess,
  NativeTaskLocationFix,
  NativeTaskLocationPort,
} from "../src/tracking/native-task-location-adapter";
import { auth, operations, scope } from "./production-shell-test-fixture";

const ids = {
  session: "55555555-5555-4555-8555-555555555555",
  task: "66666666-6666-4666-8666-666666666666",
  tracker: "77777777-7777-4777-8777-777777777777",
};

function tracking(
  taskType: "PARKING" | "RETRIEVAL" = "PARKING",
  count = 1,
  trackerId = ids.tracker,
): EmployeeOperationalSnapshot {
  return {
    ...operations("ready", { retainedScope: scope }),
    successfulQueueSnapshotCount: count,
    taskTracking: {
      movement: {
        sessionId: ids.session,
        taskId: ids.task,
        taskType,
        trackingSessionId: trackerId,
        trackingStartedAt: "2026-10-07T00:59:59.000Z",
      },
      status: "ELIGIBLE",
    },
  };
}

class FakeLocation implements NativeTaskLocationPort {
  access: NativeTaskLocationAccess = { kind: "granted" };
  callback: ((fix: NativeTaskLocationFix) => void) | undefined;
  ensureRequests: boolean[] = [];
  remove = vi.fn();
  watchCalls = 0;
  async ensureAccess(requestPermission: boolean) {
    this.ensureRequests.push(requestPermission);
    return this.access;
  }
  async inspectAccess() {
    return this.access;
  }
  async openSettings() {}
  async watch(callback: (fix: NativeTaskLocationFix) => void) {
    this.watchCalls += 1;
    this.callback = callback;
    return { remove: this.remove };
  }
}

function fixture(initial = operations("ready", { retainedScope: scope })) {
  let authSnapshot = auth("authenticated");
  let snapshot = initial;
  const authListeners = new Set<() => void>();
  const operationListeners = new Set<() => void>();
  const authPort = {
    current: () => authSnapshot,
    subscribe: (listener: () => void) => {
      authListeners.add(listener);
      listener();
      return () => void authListeners.delete(listener);
    },
  };
  const operationsPort = {
    current: () => snapshot,
    refreshQueue: vi.fn(async () => undefined),
    subscribe: (listener: () => void) => {
      operationListeners.add(listener);
      listener();
      return () => void operationListeners.delete(listener);
    },
  };
  const location = new FakeLocation();
  const upload = vi.fn(async (_sessionId: string, samples: readonly EmployeeGpsSample[]) => ({
    samples: samples.map((sample) => ({
      clientSampleId: sample.clientSampleId,
      status: "ACCEPTED" as const,
    })),
  }));
  let id = 0;
  const runtime = new NativeTaskTrackingRuntime({
    auth: authPort as never,
    createId: () =>
      `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    location,
    now: () => Date.parse("2026-10-07T01:00:00.000Z"),
    operations: operationsPort as never,
    transport: { upload },
  });
  return {
    location,
    operationsPort,
    runtime,
    setAuth(next: ReturnType<typeof auth>) {
      authSnapshot = next;
      authListeners.forEach((listener) => listener());
    },
    setSnapshot(next: EmployeeOperationalSnapshot) {
      snapshot = next;
      operationListeners.forEach((listener) => listener());
    },
    upload,
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

describe("#270 Native task tracking authority owner", () => {
  it("does not watch for Shift-only, ASSIGNED or ACCEPTED task state without server eligibility", async () => {
    const s = fixture();
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchCalls).toBe(0);
    for (const status of ["ASSIGNED", "ACCEPTED"] as const) {
      s.setSnapshot({
        ...operations("ready", { retainedScope: scope }),
        tasks: [{ status } as never],
      });
      await settle();
      expect(s.location.watchCalls).toBe(0);
    }
    s.runtime.dispose();
  });

  it.each(["PARKING", "RETRIEVAL"] as const)(
    "starts one foreground watcher only for one eligible %s movement",
    async (taskType) => {
      const s = fixture(tracking(taskType));
      s.runtime.setForeground(true);
      await settle();
      expect(s.location.watchCalls).toBe(1);
      expect(s.runtime.current()).toEqual({ kind: "active", taskType });
      s.runtime.dispose();
    },
  );

  it("stops for PARKED/READY, tracker loss, policy loss and multiple eligible movements", async () => {
    const s = fixture(tracking("RETRIEVAL"));
    s.runtime.setForeground(true);
    await settle();
    s.setSnapshot({ ...tracking("RETRIEVAL", 2), taskTracking: { status: "NONE" } });
    expect(s.location.remove).toHaveBeenCalledOnce();
    expect(s.runtime.current().kind).toBe("idle");
    s.setSnapshot({ ...tracking("RETRIEVAL", 3), taskTracking: { status: "AMBIGUOUS" } });
    expect(s.runtime.current().kind).toBe("ambiguous");
    expect(s.location.watchCalls).toBe(1);
    s.runtime.dispose();
  });

  it("retires on background, logout, auth replacement and Location scope replacement", async () => {
    const s = fixture(tracking());
    s.runtime.setForeground(true);
    await settle();
    s.runtime.setForeground(false);
    expect(s.location.remove).toHaveBeenCalledOnce();
    s.setSnapshot(tracking("PARKING", 2));
    s.runtime.setForeground(true);
    await settle();
    expect(s.location.watchCalls).toBe(2);
    s.setAuth(auth("unauthenticated", 2));
    expect(s.location.remove).toHaveBeenCalledTimes(2);
    s.setAuth(auth("authenticated", 2));
    s.setSnapshot({
      ...tracking("PARKING", 3),
      identityGeneration: 2,
      scope: { ...scope, locationId: "99999999-9999-4999-8999-999999999999" },
    });
    await settle();
    expect(s.location.watchCalls).toBe(3);
    s.runtime.dispose();
  });

  it("requires fresh authoritative queue success after offline recovery", async () => {
    const s = fixture(tracking());
    s.runtime.setForeground(true);
    await settle();
    s.runtime.setOnline(false);
    expect(s.location.remove).toHaveBeenCalledOnce();
    s.runtime.setOnline(true);
    await settle();
    expect(s.location.watchCalls).toBe(1);
    s.setSnapshot(tracking("PARKING", 2));
    await settle();
    expect(s.location.watchCalls).toBe(2);
    s.runtime.dispose();
  });

  it("does not reprompt a denied tracker until explicit retry", async () => {
    const s = fixture(tracking());
    s.location.access = { canAskAgain: true, kind: "denied" };
    s.runtime.setForeground(true);
    await settle();
    expect(s.runtime.current().kind).toBe("permission-denied");
    expect(s.location.ensureRequests.filter(Boolean)).toHaveLength(1);
    s.runtime.setForeground(false);
    s.runtime.setForeground(true);
    await settle();
    s.setSnapshot(tracking("PARKING", 2));
    s.setAuth(auth("authenticated"));
    await settle();
    expect(s.location.ensureRequests.filter(Boolean)).toHaveLength(1);
    s.runtime.retry();
    await settle();
    expect(s.location.ensureRequests.filter(Boolean)).toHaveLength(2);
    s.setSnapshot(tracking("PARKING", 3, "88888888-8888-4888-8888-888888888888"));
    await settle();
    expect(s.location.ensureRequests.filter(Boolean)).toHaveLength(3);
    s.runtime.dispose();
  });

  it("process restart cannot track before fresh authority is rehydrated", async () => {
    const first = fixture(tracking());
    first.runtime.setForeground(true);
    await settle();
    expect(first.location.watchCalls).toBe(1);
    first.runtime.dispose();
    const restarted = fixture();
    restarted.runtime.setForeground(true);
    await settle();
    expect(restarted.location.watchCalls).toBe(0);
    restarted.setSnapshot(tracking());
    await settle();
    expect(restarted.location.watchCalls).toBe(1);
    restarted.runtime.dispose();
  });

  it("suspends before local Mark Ready and only restarts after fresh server truth", async () => {
    const s = fixture(tracking("RETRIEVAL"));
    type RetrievalSnapshot = {
      readonly phase: "retrieving" | "submitting-ready" | "ready";
    };
    const listeners = new Set<(value: RetrievalSnapshot) => void>();
    let retrieval: RetrievalSnapshot = { phase: "retrieving" };
    const session = {
      current: () => retrieval,
      subscribe: (listener: (value: RetrievalSnapshot) => void) => {
        listeners.add(listener);
        listener(retrieval);
        return () => void listeners.delete(listener);
      },
    };
    const confirmation = { current: () => ({ phase: "inactive" }), subscribe: () => () => {} };
    s.runtime.bindMovementCompletion(confirmation as never, session as never);
    s.runtime.setForeground(true);
    await settle();
    retrieval = { phase: "submitting-ready" };
    listeners.forEach((listener) => listener(retrieval));
    expect(s.location.remove).toHaveBeenCalledOnce();
    retrieval = { phase: "retrieving" };
    listeners.forEach((listener) => listener(retrieval));
    expect(s.operationsPort.refreshQueue).toHaveBeenCalledOnce();
    expect(s.location.watchCalls).toBe(1);
    s.setSnapshot(tracking("RETRIEVAL", 2));
    await settle();
    expect(s.location.watchCalls).toBe(2);
    retrieval = { phase: "ready" };
    listeners.forEach((listener) => listener(retrieval));
    expect(s.location.remove).toHaveBeenCalledTimes(2);
    s.runtime.dispose();
  });
});
