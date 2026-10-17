import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import { shouldShowNativeHandoff } from "../src/handoff/native-handoff-route-presentation";
import { executeNativeTaskReentry } from "../src/shell/native-task-reentry";
import { closeRetrieval } from "../src/shell/native-production-workflow-navigation";
import { operations, scope } from "./production-shell-test-fixture";

function task(id: string, state: StaffTaskQueueItem["valetSessionState"]): StaffTaskQueueItem {
  return {
    createdAt: "2026-10-17T00:00:00.000Z",
    currentAssigneeMembershipId: scope.membershipId,
    parkingSpot: null,
    parkingZone: null,
    retrievalRequestedAt: "2026-10-17T00:00:00.000Z",
    sessionId: `session-${id}`,
    status: "IN_PROGRESS",
    taskId: id,
    taskType: "RETRIEVAL",
    valetSessionState: state,
    valetSessionVersion: 3,
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
    version: 5,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(tasks: StaffTaskQueueItem[]) {
  let currentOperations: EmployeeOperationalSnapshot = {
    ...operations("ready"),
    tasks,
  };
  let retrievalPhase = "inactive";
  let retrievalTask: StaffTaskQueueItem | null = null;
  let retrievalRevision = 0;
  let handoffPhase = "inactive";
  let handoffTask: StaffTaskQueueItem | null = null;
  let releasePhase = "inactive";
  const pending = new Map<string, ReturnType<typeof deferred>>();
  const navigate = vi.fn();
  const handoff = {
    clear: vi.fn(() => {
      handoffPhase = "inactive";
      handoffTask = null;
    }),
    current: () => ({ phase: handoffPhase, task: handoffTask }),
    openTask: vi.fn(async (_generation: number, _scope: unknown, id: string, _sessionId: string) => {
      handoffTask = tasks.find((item) => item.taskId === id) ?? null;
      expect(_sessionId).toBe(handoffTask?.sessionId);
      handoffPhase = "loading";
      // Canonical Handoff reconciles before exposing any action.
      handoffPhase = "ready";
    }),
  };
  const retrieval = {
    clear: vi.fn(() => {
      retrievalRevision++;
      retrievalPhase = "inactive";
      retrievalTask = null;
    }),
    current: () => ({ phase: retrievalPhase, task: retrievalTask }),
    openQueueTask: vi.fn(async (_generation: number, _scope: unknown, id: string) => {
      const revision = ++retrievalRevision;
      retrievalPhase = "loading";
      const gate = pending.get(id);
      if (gate) await gate.promise;
      if (revision !== retrievalRevision) return;
      retrievalTask = tasks.find((item) => item.taskId === id) ?? null;
      retrievalPhase = retrievalTask?.valetSessionState === "READY"
        ? "ready" : "retrieving";
      if (retrievalPhase === "ready" && retrievalTask) {
        // Native runtime's READY onStateChange callback.
        void handoff.openTask(1, scope, retrievalTask.taskId, retrievalTask.sessionId);
      }
    }),
  };
  const runtime = {
    handoff,
    release: {
      clear: vi.fn(() => { releasePhase = "inactive"; }),
      current: () => ({ phase: releasePhase }),
    },
    retrieval,
    operations: {
      current: () => currentOperations,
      refreshQueue: vi.fn(async () => undefined),
    },
    parking: {},
  };
  const revision = { current: 0 };
  const entry = (selected: StaffTaskQueueItem) =>
    executeNativeTaskReentry({
      authSnapshot: { authGeneration: 1, phase: "authenticated" },
      navigate,
      revision,
      runtime: runtime as never,
      shell: { kind: "active", destination: "tasks", scope } as never,
      task: selected,
    });
  return {
    entry, handoff, navigate, pending, retrieval, revision, runtime,
    setOperations: (snapshot: EmployeeOperationalSnapshot) => { currentOperations = snapshot; },
    setHandoff: (phase: string) => { handoffPhase = phase; },
    setRelease: (phase: string) => { releasePhase = phase; },
  };
}

describe("Issue 297: native Retrieval re-entry", () => {
  it("restores canonical READY Secure Handoff after Back to Tasks and reopen, exactly once", async () => {
    const ready = task("task-ready", "READY");
    const h = harness([ready]);
    // Previously opened READY Handoff; Back to Tasks retires that target.
    h.setHandoff("ready");
    h.setRelease("inactive");
    closeRetrieval(h.runtime as never, h.navigate);
    expect(h.handoff.current().phase).toBe("inactive");
    h.navigate.mockClear();
    h.handoff.clear.mockClear();

    expect(await h.entry(ready)).toBe(true);
    expect(h.retrieval.current()).toMatchObject({ phase: "ready", task: ready });
    expect(h.handoff.openTask).toHaveBeenCalledExactlyOnceWith(
      1, scope, ready.taskId, ready.sessionId,
    );
    expect(h.handoff.current()).toMatchObject({ phase: "ready", task: ready });
    expect(h.handoff.clear).toHaveBeenCalledTimes(1);
    expect(shouldShowNativeHandoff(
      { phase: "ready", session: { state: "READY" } } as never,
      { phase: "ready" } as never,
      { phase: "inactive" } as never,
    )).toBe(true);
    expect(h.navigate).toHaveBeenCalledExactlyOnceWith("retrieval");
  });

  it("fences Task A's delayed READY load when opening Task B, with no stale Handoff", async () => {
    const a = task("task-a", "READY");
    const b = task("task-b", "RETRIEVING");
    const h = harness([a, b]);
    const first = deferred();
    h.pending.set(a.taskId, first);
    h.setHandoff("ready");
    h.setRelease("inactive");
    const actionA = h.entry(a);
    expect(h.retrieval.current().phase).toBe("loading");
    expect(await h.entry(b)).toBe(true);
    expect(h.retrieval.current()).toMatchObject({ phase: "retrieving", task: b });
    expect(h.handoff.current().phase).toBe("inactive");
    first.resolve();
    expect(await actionA).toBe(false);
    expect(h.retrieval.current()).toMatchObject({ phase: "retrieving", task: b });
    expect(h.handoff.openTask).not.toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledExactlyOnceWith("retrieval");

    // Reassignment/ended Shift still fail closed with no stale Handoff.
    h.setOperations({ ...operations("ready"), tasks: [
      { ...a, currentAssigneeMembershipId: "someone-else" },
    ] });
    expect(await h.entry(a)).toBe(false);
    expect(h.handoff.current().phase).toBe("inactive");
    expect(h.handoff.openTask).not.toHaveBeenCalled();
  });

  it("uses the canonical route when a clicked card's Handoff state is stale", async () => {
    const ready = task("task-ready", "READY");
    const h = harness([ready]);
    expect(await h.entry({ ...ready, valetSessionState: "HANDOFF_PENDING" })).toBe(true);
    expect(h.handoff.openTask).toHaveBeenCalledTimes(1);
    expect(h.retrieval.current().phase).toBe("ready");

    const pending = task("task-pending", "HANDOFF_PENDING");
    const p = harness([pending]);
    expect(await p.entry({ ...pending, valetSessionState: "READY" })).toBe(true);
    expect(p.retrieval.current().phase).toBe("inactive");
    expect(p.handoff.openTask).toHaveBeenCalledExactlyOnceWith(
      1, scope, pending.taskId, pending.sessionId,
    );
  });
});
