import { describe, expect, it, vi } from "vitest";

import {
  launchCompletedCheckInParking,
  openCompletedCheckInParking,
} from "../src/parking/native-completed-check-in-parking";

describe("Check-In pre-start Parking continuation", () => {
  it.each(["assigned", "accepted"] as const)(
    "opens pre-start Parking from %s without starting physical custody",
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
      const started = await openCompletedCheckInParking({
        identityGeneration: 7,
        operations: {
          current: readyAuthority,
          acceptTask,
          refreshQueue,
        } as never,
        parking: {
          checkServerState,
          current: () => ({
            identityGeneration: 7,
            scope: {},
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
      expect(startParking).not.toHaveBeenCalled();
      expect(acceptTask).toHaveBeenCalledTimes(
        initialPhase === "assigned" ? 1 : 0,
      );
      expect(phase).toBe("accepted");
      expect(started).toBe(true);
    },
  );

  it("does not start when authoritative reconciliation is unavailable", async () => {
    const startParking = vi.fn();
    const started = await openCompletedCheckInParking({
      identityGeneration: 7,
      operations: { current: readyAuthority } as never,
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
    const result = await openCompletedCheckInParking({
      identityGeneration: 7,
      operations: { current: readyAuthority } as never,
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

  it("clears and navigates once after authoritative pre-start state", async () => {
    let phase = "assigned";
    const clearCheckIn = vi.fn();
    const navigateParking = vi.fn();
    const parking = {
      current: () => ({
        identityGeneration: 7,
        scope: {},
        phase,
        session: { sessionId: "session-1" },
        task: { sessionId: "session-1", taskId: "task-1" },
      }),
      openCompletedCheckIn: vi.fn(async () => undefined),
      checkServerState: vi.fn(async () => {
        phase = "accepted";
      }),
      startParking: vi.fn(async () => {
        phase = "started";
      }),
    };
    const input = {
      clearCheckIn,
      identityGeneration: 7,
      navigateParking,
      operations: {
        current: readyAuthority,
        refreshQueue: vi.fn(),
        acceptTask: vi.fn(),
      } as never,
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
    expect(parking.startParking).not.toHaveBeenCalled();
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
      operations: { current: readyAuthority } as never,
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

function readyAuthority() {
  return { phase: "ready", identityGeneration: 7, scope: {} };
}
