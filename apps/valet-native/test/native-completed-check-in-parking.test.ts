import { describe, expect, it, vi } from "vitest";

import {
  launchCompletedCheckInParking,
  startCompletedCheckInParking,
} from "../src/parking/native-completed-check-in-parking";

describe("Check-In Parking Task one-action continuation", () => {
  it.each(["assigned", "accepted"] as const)(
    "reaches started Parking from %s without another employee action",
    async (initialPhase) => {
      let phase: string = initialPhase;
      const task = { sessionId: "session-1", taskId: "task-1" };
      const openCompletedCheckIn = vi.fn(async () => undefined);
      const refreshQueue = vi.fn(async () => undefined);
      const acceptTask = vi.fn(async () => undefined);
      const checkServerState = vi.fn(async () => {
        phase = "accepted";
      });
      const startParking = vi.fn(async () => {
        phase = "started";
      });
      const started = await startCompletedCheckInParking({
        identityGeneration: 7,
        operations: { acceptTask, refreshQueue } as never,
        parking: {
          checkServerState,
          current: () => ({
            phase,
            session: { sessionId: "session-1" },
            task,
          }),
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
      expect(started).toBe(true);
    },
  );

  it("does not start when authoritative reconciliation is unavailable", async () => {
    const startParking = vi.fn();
    const started = await startCompletedCheckInParking({
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
    expect(started).toBe(false);
  });

  it("reuses an already-started authoritative Parking session", async () => {
    const startParking = vi.fn();
    const openCompletedCheckIn = vi.fn(async () => undefined);
    const result = await startCompletedCheckInParking({
      identityGeneration: 7,
      operations: {} as never,
      parking: {
        current: () => ({
          identityGeneration: 7,
          phase: "started",
          scope: {},
          session: { sessionId: "session-1" },
          task: { sessionId: "session-1" },
        }),
        openCompletedCheckIn,
        startParking,
      } as never,
      scope: {} as never,
      sessionId: "session-1",
    });
    expect(result).toBe(true);
    expect(openCompletedCheckIn).not.toHaveBeenCalled();
    expect(startParking).not.toHaveBeenCalled();
  });

  it("clears and navigates only after authoritative started state", async () => {
    let phase = "accepted";
    const clearCheckIn = vi.fn();
    const navigateParking = vi.fn();
    const parking = {
      current: () => ({
        phase,
        session: { sessionId: "session-1" },
        task: { sessionId: "session-1", taskId: "task-1" },
      }),
      openCompletedCheckIn: vi.fn(async () => undefined),
      startParking: vi.fn(async () => {
        phase = "started";
      }),
    };
    const input = {
      clearCheckIn,
      identityGeneration: 7,
      navigateParking,
      operations: {} as never,
      parking: parking as never,
      scope: {} as never,
      sessionId: "session-1",
    };
    const [first, second] = await Promise.all([
      launchCompletedCheckInParking(input),
      launchCompletedCheckInParking(input),
    ]);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(parking.openCompletedCheckIn).toHaveBeenCalledOnce();
    expect(parking.startParking).toHaveBeenCalledOnce();
    expect(clearCheckIn).toHaveBeenCalledOnce();
    expect(navigateParking).toHaveBeenCalledOnce();
  });

  it("leaves Check-In intact when Parking does not reach started", async () => {
    const clearCheckIn = vi.fn();
    const navigateParking = vi.fn();
    const result = await launchCompletedCheckInParking({
      clearCheckIn,
      identityGeneration: 7,
      navigateParking,
      operations: {} as never,
      parking: {
        current: () => ({ phase: "conflict", session: {}, task: {} }),
        openCompletedCheckIn: vi.fn(async () => undefined),
      } as never,
      scope: {} as never,
      sessionId: "session-1",
    });
    expect(result).toBe(false);
    expect(clearCheckIn).not.toHaveBeenCalled();
    expect(navigateParking).not.toHaveBeenCalled();
  });
});
