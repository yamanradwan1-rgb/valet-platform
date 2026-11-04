import { describe, expect, it } from "vitest";

import { projectManagementReadyCandidate } from "../src/modules/retrieval/management-ready-episode";

const sessionId = "20920ed4-7e31-434d-9417-7ac8c52fb741";
const readyAt = new Date("2026-11-04T10:00:00.123Z");
const handoffAt = new Date("2026-11-04T10:02:00.123Z");

describe("Issue #414 ALT-06 readiness source phase (internal only)", () => {
  it("preserves the original READY anchor across initiate, abort and reinitiate", () => {
    const ready = projectManagementReadyCandidate({
      sessionId,
      state: "READY",
      readyAt,
      handoffPendingAt: null,
    });
    const handoff = projectManagementReadyCandidate({
      sessionId,
      state: "HANDOFF_PENDING",
      readyAt,
      handoffPendingAt: handoffAt,
    });
    const aborted = projectManagementReadyCandidate({
      sessionId,
      state: "READY",
      readyAt,
      handoffPendingAt: null,
    });
    const reinitiated = projectManagementReadyCandidate({
      sessionId,
      state: "HANDOFF_PENDING",
      readyAt,
      handoffPendingAt: new Date("2026-11-04T10:12:00.123Z"),
    });

    expect(ready).toMatchObject({
      sourceId: sessionId,
      readyAt: "2026-11-04T10:00:00.123Z",
      state: "READY",
    });
    expect([handoff, aborted, reinitiated].map((source) => source?.readyAt))
      .toEqual([ready?.readyAt, ready?.readyAt, ready?.readyAt]);
    expect(handoff?.state).toBe("HANDOFF_PENDING");
  });

  it("retires on release/terminal or pre-READY phases despite Task state", () => {
    for (const state of [
      "REQUESTED",
      "RETRIEVING",
      "COMPLETED",
      "CANCELLED",
      "PARKED",
    ]) {
      expect(
        projectManagementReadyCandidate({
          sessionId,
          state,
          readyAt,
          handoffPendingAt: null,
        }),
      ).toBeNull();
    }
  });

  it("rejects incoherent or missing READY/HANDOFF_PENDING clocks", () => {
    expect(
      projectManagementReadyCandidate({
        sessionId,
        state: "READY",
        readyAt: null,
        handoffPendingAt: null,
      }),
    ).toBeNull();
    expect(
      projectManagementReadyCandidate({
        sessionId,
        state: "READY",
        readyAt,
        handoffPendingAt: handoffAt,
      }),
    ).toBeNull();
    expect(
      projectManagementReadyCandidate({
        sessionId,
        state: "HANDOFF_PENDING",
        readyAt,
        handoffPendingAt: null,
      }),
    ).toBeNull();
    expect(
      projectManagementReadyCandidate({
        sessionId,
        state: "HANDOFF_PENDING",
        readyAt,
        handoffPendingAt: new Date("2026-11-04T09:59:59.999Z"),
      }),
    ).toBeNull();
    expect(
      projectManagementReadyCandidate({
        sessionId,
        state: "READY",
        readyAt: new Date(Number.NaN),
        handoffPendingAt: null,
      }),
    ).toBeNull();
  });

  it("does not invent a unique episode ID for a same-ms second READY entry", () => {
    const old = projectManagementReadyCandidate({
      sessionId,
      state: "READY",
      readyAt,
      handoffPendingAt: null,
    });
    const sameMillisecondNewReady = projectManagementReadyCandidate({
      sessionId,
      state: "READY",
      readyAt: new Date(readyAt.getTime()),
      handoffPendingAt: null,
    });
    expect(sameMillisecondNewReady).toEqual(old);
    expect(old).not.toHaveProperty("episodeId");
  });
});
