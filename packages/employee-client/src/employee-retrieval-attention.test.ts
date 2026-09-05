import { describe, expect, it } from "vitest";

import { EmployeeRetrievalAttentionTracker } from "./employee-retrieval-attention";
import { emptyEmployeeOperationalSnapshot } from "./employee-operational-state";
import { resolveEmployeeOperationalScope } from "./employee-operational-scope";
import type { EmployeeOperationalSnapshot } from "./employee-operational-types";
import {
  operationalContext,
  parkingTask,
} from "./employee-operational-test-fixture";

function snapshot(
  count: number,
  tasks: EmployeeOperationalSnapshot["tasks"],
  overrides: Partial<EmployeeOperationalSnapshot> = {},
): EmployeeOperationalSnapshot {
  const resolution = resolveEmployeeOperationalScope(operationalContext());
  if (resolution.phase !== "ready") throw new Error("Expected ready scope");
  return {
    ...emptyEmployeeOperationalSnapshot(),
    identityGeneration: 1,
    phase: "ready",
    scope: resolution.scope,
    successfulQueueSnapshotCount: count,
    tasks,
    ...overrides,
  };
}

function retrieval(id: string, status: "QUEUED" | "ASSIGNED" = "QUEUED") {
  return parkingTask({
    currentAssigneeMembershipId: status === "QUEUED" ? null : "member-other",
    retrievalRequestedAt: "2026-09-03T08:10:00.000Z",
    status,
    taskId: id,
    taskType: "RETRIEVAL",
  });
}

describe("Employee foreground retrieval attention", () => {
  it("uses the initial successful snapshot only as a baseline", () => {
    const tracker = new EmployeeRetrievalAttentionTracker();
    expect(tracker.observe(snapshot(1, [retrieval("r1")])).newTaskIds).toEqual(
      [],
    );
  });

  it("alerts for a new unassigned queued Retrieval task", () => {
    const tracker = new EmployeeRetrievalAttentionTracker();
    tracker.observe(snapshot(1, []));
    expect(tracker.observe(snapshot(2, [retrieval("r1")])).newTaskIds).toEqual([
      "r1",
    ]);
  });

  it("does not alert for Parking, assigned, accepted, or in-progress work", () => {
    const tracker = new EmployeeRetrievalAttentionTracker();
    tracker.observe(snapshot(1, []));
    expect(
      tracker.observe(
        snapshot(2, [
          parkingTask({ taskId: "p1" }),
          retrieval("r1", "ASSIGNED"),
          retrieval("r2", "QUEUED"),
          retrieval("r3", "QUEUED"),
        ]),
      ).newTaskIds,
    ).toEqual(["r2", "r3"]);
  });

  it("deduplicates an observed task across later snapshots and reappearance", () => {
    const tracker = new EmployeeRetrievalAttentionTracker();
    tracker.observe(snapshot(1, []));
    tracker.observe(snapshot(2, [retrieval("r1")]));
    tracker.observe(snapshot(3, []));
    expect(tracker.observe(snapshot(4, [retrieval("r1")])).newTaskIds).toEqual(
      [],
    );
  });

  it("ignores rerenders that reuse the same successful snapshot count", () => {
    const tracker = new EmployeeRetrievalAttentionTracker();
    tracker.observe(snapshot(1, []));
    expect(tracker.observe(snapshot(1, [retrieval("r1")])).newTaskIds).toEqual(
      [],
    );
  });

  it("purges observations on identity, Location, or Shift scope replacement", () => {
    const tracker = new EmployeeRetrievalAttentionTracker();
    tracker.observe(snapshot(1, []));
    tracker.observe(snapshot(2, [retrieval("r1")]));
    const replaced = snapshot(1, [retrieval("r1")], {
      identityGeneration: 2,
    });
    const result = tracker.observe(replaced);
    expect(result.scopeChanged).toBe(true);
    expect(result.newTaskIds).toEqual([]);
  });

  it("purges immediately on hard stop or logout", () => {
    const tracker = new EmployeeRetrievalAttentionTracker();
    tracker.observe(snapshot(1, []));
    tracker.observe(snapshot(2, [retrieval("r1")]));
    expect(
      tracker.observe(snapshot(2, [], { queueHardStopped: true })).scopeChanged,
    ).toBe(true);
    expect(
      tracker.observe(emptyEmployeeOperationalSnapshot()).newTaskIds,
    ).toEqual([]);
  });
});
