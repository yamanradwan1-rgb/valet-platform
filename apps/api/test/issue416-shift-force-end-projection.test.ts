import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { forceEndStaffShift } from "../src/modules/management/staff-shift-force-end-repository";

describe("#416 X01 exact Shift projection regression (not VAP1 authorization proof)", () => {
  it("returns the persisted Shift.started_at rather than the closure/command timestamp", async () => {
    const organizationId = randomUUID();
    const shiftId = randomUUID();
    const membershipId = randomUUID();
    const locationId = randomUUID();
    const command = {
      operationId: randomUUID(),
      confirmation: "FORCE_END_SHIFT" as const,
      reason: "Controlled operational handoff",
    };
    const actualStartedAt = new Date("2026-01-15T04:37:12.321Z");
    const actualEndedAt = new Date("2026-01-15T13:23:11.999Z");
    const query = vi.fn(async () => ({
      rowCount: 1,
      rows: [{
        operation_id: command.operationId,
        shift_id: shiftId,
        membership_id: membershipId,
        location_id: locationId,
        started_at: actualStartedAt,
        ended_at: actualEndedAt,
      }],
    }));
    const transaction = { query } as unknown as PostgresTransaction;
    const context = {
      userId: randomUUID(), staffAuthSessionId: randomUUID(),
      accessTokenHash: "not-authorization-evidence",
    } as StaffSessionContext;
    const result = await forceEndStaffShift(
      transaction, context, organizationId, shiftId, command,
    );
    expect(result).toMatchObject({
      operationId: command.operationId,
      shiftId,
      membershipId,
      locationId,
      status: "ENDED",
      startedAt: actualStartedAt.toISOString(),
      endedAt: actualEndedAt.toISOString(),
    });
    expect(result.startedAt).not.toBe(result.endedAt);
    // This mocks only a repository's returned projection. Real authenticated
    // VAP1 proof/SQL ACL and Task/Shift concurrency remain separate gates.
    expect(query).toHaveBeenCalledTimes(1);
  });
});
