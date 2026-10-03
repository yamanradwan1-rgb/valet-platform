import { describe, expect, it, vi } from "vitest";
import { executeNativeTaskAction } from "../src/tasks/native-task-action-sequence";
import { launchCompletedCheckInParking } from "../src/parking/native-completed-check-in-parking";
import { operations, scope } from "./production-shell-test-fixture";
function held() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const task = {
  taskId: "task",
  sessionId: "session",
  status: "ACCEPTED",
  taskType: "PARKING",
  currentAssigneeMembershipId: scope.membershipId,
  version: 3,
};
describe("Issue #261 Native entry lifecycle fencing", () => {
  it("keeps completed Check-In when operational authority is retired during entry", async () => {
    const read = held();
    let active = true;
    const input = {
      identityGeneration: 7,
      scope,
      sessionId: "session",
      operations: {
        current: () =>
          operations(active ? "ready" : "access-denied", { generation: 7 }),
      } as never,
      parking: {
        current: () => ({
          phase: "accepted",
          identityGeneration: 7,
          scope,
          session: { sessionId: "session" },
          task: { sessionId: "session" },
        }),
        openCompletedCheckIn: () => read.promise,
        workflowRevision: () => 1,
      } as never,
      clearCheckIn: vi.fn(),
      navigateParking: vi.fn(),
    };
    const result = launchCompletedCheckInParking(input);
    active = false;
    read.resolve();
    expect(await result).toBe(false);
    expect(input.clearCheckIn).not.toHaveBeenCalled();
    expect(input.navigateParking).not.toHaveBeenCalled();
  });
  it.each(["TASK", "CHECK_IN"])(
    "fences late %s entry across A-B-A/reopen/background boundaries",
    async (entry) => {
      const read = held();
      let revision = 0;
      const parking = {
        current: () => ({
          phase: "accepted",
          task,
          session: { sessionId: "session" },
          scope,
          identityGeneration: 7,
        }),
        workflowRevision: () => revision,
        openQueueTask: vi.fn(() => {
          revision += 1;
          return read.promise;
        }),
        openCompletedCheckIn: vi.fn(() => {
          revision += 1;
          return read.promise;
        }),
        startParking: vi.fn(),
      };
      const operational = {
        current: () => ({
          ...operations("ready", { generation: 7 }),
          tasks: [task],
        }),
      };
      const clearCheckIn = vi.fn();
      const navigateParking = vi.fn();
      const result =
        entry === "TASK"
          ? executeNativeTaskAction({
              parking: parking as never,
              operations: operational as never,
              retrieval: {} as never,
              identityGeneration: 7,
              scope,
              task: task as never,
            })
          : launchCompletedCheckInParking({
              parking: parking as never,
              operations: operational as never,
              identityGeneration: 7,
              scope,
              sessionId: "session",
              clearCheckIn,
              navigateParking,
            });
      revision += 2; // A -> B -> A: IDs are identical again but the workflow owner has changed.
      read.resolve();
      expect(await result).toEqual(
        entry === "TASK" ? { kind: "failed" } : false,
      );
      expect(parking.startParking).not.toHaveBeenCalled();
      expect(navigateParking).not.toHaveBeenCalled();
      expect(clearCheckIn).not.toHaveBeenCalled();
    },
  );
  it("does not coalesce a different completed Check-In target into an outstanding launch", async () => {
    const read = held();
    const parking = {
      current: () => ({ phase: "loading", task: null, session: null }),
      openCompletedCheckIn: () => read.promise,
      workflowRevision: () => 1,
    };
    const input = {
      parking: parking as never,
      operations: {
        current: () => operations("ready", { generation: 7 }),
      } as never,
      identityGeneration: 7,
      scope,
      sessionId: "A",
      clearCheckIn: vi.fn(),
      navigateParking: vi.fn(),
    };
    const first = launchCompletedCheckInParking(input);
    expect(
      await launchCompletedCheckInParking({ ...input, sessionId: "B" }),
    ).toBe(false);
    read.resolve();
    expect(await first).toBe(false);
    expect(input.navigateParking).not.toHaveBeenCalled();
  });
});
