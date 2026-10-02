import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { staffShiftForceEndResultSchema } from "@valet/contracts";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";

const fixture = new StaffShiftForceEndTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-F administrative Shift closure", () => {
  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "%s closes with authoritative pending cash and actual manager audit",
    async (role) => {
      const s = await fixture.scenario(role);
      const response = await fixture.force(s, {
        ...s.command,
        reason: ` \uFEFF${s.command.reason}\n `,
      });
      expect(response.status).toBe(201);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const result = staffShiftForceEndResultSchema.parse(response.body);
      expect(result).toMatchObject({
        shiftId: s.shiftId,
        membershipId: s.membershipId,
        locationId: s.locationId,
        operationId: s.command.operationId,
        closureKind: "ADMIN_FORCE_END",
        cashReconciliationState: "PENDING",
      });
      expect(JSON.stringify(response.body).includes(s.command.reason)).toBe(
        false,
      );
      expect(await fixture.snapshot(s.shiftId)).toEqual({
        status: "ENDED",
        ended_at: new Date(result.endedAt),
        cash_expected: null,
        cash_reported: null,
        cash_variance: null,
        cash_currency: null,
        cash_reported_at: null,
        cash_reported_by_membership_id: null,
        closures: 1,
        audits: 1,
      });
      const audit = await fixture.query<Record<string, unknown>>(
        `SELECT actor_membership_id,organization_id,location_id,
      entity_type,entity_id,occurred_at,metadata_json FROM audit_events
      WHERE entity_id=$1 AND event_type='SHIFT_FORCE_ENDED'`,
        [s.shiftId],
      );
      const row = audit.rows[0]!;
      expect(row.actor_membership_id).toBe(s.actorMembershipId);
      expect(row.organization_id).toBe(s.organizationId);
      expect(row.location_id).toBe(s.locationId);
      expect(row.entity_type).toBe("Shift");
      expect(row.entity_id).toBe(s.shiftId);
      expect(row.occurred_at).toEqual(new Date(result.endedAt));
      const metadata = row.metadata_json as Record<string, unknown>;
      expect(Object.keys(metadata).sort()).toEqual([
        "cashReconciliationState",
        "closureKind",
        "fromStatus",
        "operationId",
        "reason",
        "targetMembershipId",
        "toStatus",
      ]);
      expect(metadata.reason === s.command.reason).toBe(true);
      expect(metadata).toMatchObject({
        fromStatus: "ACTIVE",
        toStatus: "ENDED",
        closureKind: "ADMIN_FORCE_END",
        cashReconciliationState: "PENDING",
        targetMembershipId: s.membershipId,
        operationId: s.command.operationId,
      });
    },
  );

  it("supports explicit unknown-result reconciliation and conflicts without reason leakage", async () => {
    const s = await fixture.scenario();
    const first = await fixture.force(s); // caller may lose this response
    const retry = await fixture.force(s);
    expect(first.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    const conflict = await fixture.force(s, {
      ...s.command,
      reason: "another request",
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body?.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(JSON.stringify(conflict.body).includes(s.command.reason)).toBe(
      false,
    );
    const different = await fixture.force(s, {
      ...s.command,
      operationId: randomUUID(),
    });
    expect(different.status).toBe(409);
    expect(different.body?.code).toBe("SHIFT_ALREADY_ENDED");
    const state = await fixture.snapshot(s.shiftId);
    expect(state.closures).toBe(1);
    expect(state.audits).toBe(1);
  });

  it("preserves self-reported cash and denies self-end after administrative closure", async () => {
    const pool = fixture.runtimePool();
    try {
      const self = await fixture.scenario();
      const end = createEndShiftCommandExecutor(pool);
      await end({
        authenticatedUserId: self.targetUser.id,
        shiftId: self.shiftId,
        cashReported: "7.000",
      });
      const before = await fixture.snapshot(self.shiftId);
      expect((await fixture.force(self)).body?.code).toBe(
        "SHIFT_ALREADY_ENDED",
      );
      expect(await fixture.snapshot(self.shiftId)).toEqual(before);
      const forced = await fixture.scenario();
      expect((await fixture.force(forced)).status).toBe(201);
      await expect(
        end({
          authenticatedUserId: forced.targetUser.id,
          shiftId: forced.shiftId,
          cashReported: "7.000",
        }),
      ).rejects.toMatchObject({
        code: "SHIFT_CASH_RECONCILIATION_UNAVAILABLE",
      });
      expect((await fixture.snapshot(forced.shiftId)).cash_reported).toBeNull();
    } finally {
      await pool.end();
    }
  });

  it.each(["ASSIGNED", "ACCEPTED", "IN_PROGRESS"])(
    "blocks %s Task without side effects",
    async (status) => {
      const s = await fixture.scenario();
      const task = await fixture.task(s, status);
      const before = (
        await fixture.query("SELECT * FROM tasks WHERE id=$1", [task.taskId])
      ).rows;
      const sessionBefore = (
        await fixture.query("SELECT * FROM valet_sessions WHERE id=$1", [
          task.sessionId,
        ])
      ).rows;
      const response = await fixture.force(s);
      expect(response.status).toBe(409);
      expect(response.body?.code).toBe("OPEN_TASK_HANDOFF_REQUIRED");
      expect(await fixture.snapshot(s.shiftId)).toMatchObject({
        status: "ACTIVE",
        closures: 0,
        audits: 0,
      });
      expect(
        (await fixture.query("SELECT * FROM tasks WHERE id=$1", [task.taskId]))
          .rows,
      ).toEqual(before);
      expect(
        (
          await fixture.query("SELECT * FROM valet_sessions WHERE id=$1", [
            task.sessionId,
          ])
        ).rows,
      ).toEqual(sessionBefore);
    },
  );

  it("rolls back Shift, closure and admin activity when audit fails", async () => {
    const s = await fixture.scenario();
    const before = (await fixture.sessionSnapshot(s.auth.sessionId)).rows[0];
    await fixture.query(`ALTER TABLE audit_events ADD CONSTRAINT force_end_test_failure
      CHECK(event_type<>'SHIFT_FORCE_ENDED') NOT VALID`);
    try {
      const response = await fixture.force(s);
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body).includes(s.command.reason)).toBe(
        false,
      );
      expect(await fixture.snapshot(s.shiftId)).toMatchObject({
        status: "ACTIVE",
        ended_at: null,
        closures: 0,
        audits: 0,
      });
      expect((await fixture.sessionSnapshot(s.auth.sessionId)).rows[0]).toEqual(
        before,
      );
    } finally {
      await fixture.query(
        "ALTER TABLE audit_events DROP CONSTRAINT force_end_test_failure",
      );
    }
    expect((await fixture.force(s)).status).toBe(201);
  });
});
