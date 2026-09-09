import { describe, expect, it, vi } from "vitest";

import { startCompletedCheckInParking } from "../src/parking/native-completed-check-in-parking";

describe("Check-In Parking Task one-action continuation", () => {
  it.each(["assigned", "accepted"] as const)(
    "reaches started Parking from %s without another employee action",
    async (initialPhase) => {
      let phase: string = initialPhase;
      const task = { taskId: "task-1" };
      const openCompletedCheckIn = vi.fn(async () => undefined);
      const refreshQueue = vi.fn(async () => undefined);
      const acceptTask = vi.fn(async () => undefined);
      const checkServerState = vi.fn(async () => {
        phase = "accepted";
      });
      const startParking = vi.fn(async () => {
        phase = "started";
      });
      await startCompletedCheckInParking({
        identityGeneration: 7,
        operations: { acceptTask, refreshQueue } as never,
        parking: {
          checkServerState,
          current: () => ({ phase, task }),
          openCompletedCheckIn,
          startParking,
        } as never,
        scope: {} as never,
        sessionId: "session-1",
      });
      expect(openCompletedCheckIn).toHaveBeenCalledOnce();
      expect(startParking).toHaveBeenCalledOnce();
      expect(acceptTask).toHaveBeenCalledTimes(
        initialPhase === "assigned" ? 1 : 0,
      );
      expect(phase).toBe("started");
    },
  );

  it("does not start when authoritative reconciliation is unavailable", async () => {
    const startParking = vi.fn();
    await startCompletedCheckInParking({
      identityGeneration: 7,
      operations: {} as never,
      parking: {
        current: () => ({ phase: "unavailable", task: null }),
        openCompletedCheckIn: vi.fn(async () => undefined),
        startParking,
      } as never,
      scope: {} as never,
      sessionId: "session-1",
    });
    expect(startParking).not.toHaveBeenCalled();
  });
});
