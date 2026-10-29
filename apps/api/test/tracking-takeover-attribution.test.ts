import type { PostgresTransaction } from "../src/common/database/postgres";
import { describe, expect, it, vi } from "vitest";

import { transitionTaskTrackingForEmergencyTakeover } from "../src/modules/tracking/tracking-takeover-attribution";

const at = new Date("2026-10-29T15:00:00.123Z");
const scope = {
  organizationId: "org",
  locationId: "loc",
  sessionId: "session",
  taskId: "task",
  fromAssigneeMembershipId: "A",
  toAssigneeMembershipId: "B",
  movementActive: true,
  operationTime: at,
};
const conflict = () => {
  throw new Error("tracking-integrity-conflict");
};
const tracker = {
  id: "tracker-A",
  task_id: "task",
  assignee_membership_id: "A",
};
function tx(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as PostgresTransaction;
}

describe("immutable emergency tracking attribution", () => {
  it("fails closed for an active legacy tracker with unknown owner", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ...tracker, assignee_membership_id: null }],
    });
    await expect(
      transitionTaskTrackingForEmergencyTakeover(tx(query), scope, conflict),
    ).rejects.toThrow("tracking-integrity-conflict");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("ends only A and starts a new B segment after the locked timestamp", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [tracker] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ tracking_enabled: true }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const result = await transitionTaskTrackingForEmergencyTakeover(
      tx(query),
      scope,
      conflict,
    );
    expect(result.endedTrackingSessionId).toBe("tracker-A");
    expect(result.startedTrackingSessionId).toBeTruthy();
    expect(result.startedTrackingSessionId).not.toBe("tracker-A");
    expect(query.mock.calls[1]![1]).toEqual(["tracker-A", at]);
    expect(query.mock.calls[3]![0]).toContain("assignee_membership_id");
    expect(query.mock.calls[3]![1][5]).toBe("B");
    expect(query.mock.calls[3]![1][6]).toBe(at);
  });

  it("does not create a B segment when tracking policy is disabled", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [tracker] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ tracking_enabled: false }] });
    const result = await transitionTaskTrackingForEmergencyTakeover(
      tx(query),
      scope,
      conflict,
    );
    expect(result).toEqual({
      endedTrackingSessionId: "tracker-A",
      startedTrackingSessionId: null,
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("does not open GPS in READY/HANDOFF_PENDING", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ tracking_enabled: true }] });
    const result = await transitionTaskTrackingForEmergencyTakeover(
      tx(query),
      { ...scope, movementActive: false },
      conflict,
    );
    expect(result.startedTrackingSessionId).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects contradictory nonmoving active tracker", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [tracker] });
    await expect(
      transitionTaskTrackingForEmergencyTakeover(
        tx(query),
        { ...scope, movementActive: false },
        conflict,
      ),
    ).rejects.toThrow("tracking-integrity-conflict");
  });
});
