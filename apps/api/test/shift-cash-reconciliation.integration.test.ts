import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CashTestContext } from "./cash-test-context";

const context = new CashTestContext("shift_reconciliation");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function cashShift() {
  const fixture = await context.createPaymentFixture({
    organizationFee: "10.000",
  });
  await context.initialize(fixture);
  const employee = await context.actor(fixture, "VALET_EMPLOYEE");
  const manager = await context.actor(fixture, "LOCATION_MANAGER");
  const shift = await context.startShift(fixture, employee);
  await context.receipt(fixture, employee, randomUUID());
  return { employee, fixture, manager, shift };
}

describe("VAL-008C Shift cash reconciliation", () => {
  it("snapshots expected, reported, variance, currency and reporter atomically", async () => {
    const { employee, fixture, manager, shift } = await cashShift();
    await context.adjustment(fixture, manager, {
      amount: "2.000",
      entryType: "ADJUSTMENT_DECREASE",
      reason: "Correct recorded denomination count",
      submissionIdempotencyKey: randomUUID(),
    });
    const ended = await context.endShift(employee, shift.shiftId, "7.000");
    expect(ended).toMatchObject({
      cashReconciliation: {
        cashExpected: "8.000",
        cashReported: "7.000",
        cashVariance: "-1.000",
        currency: "JOD",
        reportedAt: expect.any(Date),
      },
      status: "ENDED",
    });
    const snapshot = await context.shiftSnapshot(shift.shiftId);
    expect(snapshot).toMatchObject({
      cash_currency: "JOD",
      cash_expected: "8.000",
      cash_reported: "7.000",
      cash_reported_by_membership_id: employee.membershipId,
      cash_variance: "-1.000",
      status: "ENDED",
    });
    expect(snapshot.cash_reported_at).toEqual(snapshot.ended_at);
    const audit = await context.adminPool.query(
      `SELECT metadata_json FROM audit_events
       WHERE entity_type = 'Shift' AND entity_id = $1
         AND event_type = 'SHIFT_ENDED'`,
      [shift.shiftId],
    );
    expect(audit.rows[0]!.metadata_json).toMatchObject({
      cash_expected: "8.000",
      cash_reported: "7.000",
      cash_variance: "-1.000",
      currency: "JOD",
    });
  });

  it("returns the immutable original snapshot on retry and ignores post-close corrections", async () => {
    const { employee, fixture, manager, shift } = await cashShift();
    const first = await context.endShift(employee, shift.shiftId, "9.000");
    const retry = await context.endShift(employee, shift.shiftId, "1.000");
    expect(retry).toEqual(first);
    await context.adjustment(fixture, manager, {
      amount: "1.000",
      entryType: "ADJUSTMENT_DECREASE",
      reason: "Post-close recorded cash correction",
      submissionIdempotencyKey: randomUUID(),
    });
    expect(await context.shiftSnapshot(shift.shiftId)).toMatchObject({
      cash_expected: "10.000",
      cash_reported: "9.000",
      cash_variance: "-1.000",
    });
    expect(await context.countAudit(shift.shiftId, "SHIFT_ENDED")).toBe(1);
    await expect(
      context.adminPool.query(
        `UPDATE shifts SET cash_reported = 1 WHERE id = $1`,
        [shift.shiftId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("serializes concurrent close attempts and keeps exactly one report", async () => {
    const { employee, shift } = await cashShift();
    const results = await Promise.all([
      context.endShift(employee, shift.shiftId, "8.000"),
      context.endShift(employee, shift.shiftId, "6.000"),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(["8.000", "6.000"]).toContain(
      results[0].cashReconciliation?.cashReported,
    );
    expect(await context.countAudit(shift.shiftId, "SHIFT_ENDED")).toBe(1);
  });

  it("rolls Shift status, reconciliation, and audit back together", async () => {
    const first = await cashShift();
    await context.endShift(first.employee, first.shift.shiftId, "10.000");
    const audit = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM audit_events
       WHERE entity_type = 'Shift' AND entity_id = $1
         AND event_type = 'SHIFT_ENDED'`,
      [first.shift.shiftId],
    );
    const second = await cashShift();
    await expect(
      context.endShift(second.employee, second.shift.shiftId, "10.000", {
        auditEventIdFactory: () => audit.rows[0]!.id,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await context.shiftSnapshot(second.shift.shiftId)).toMatchObject({
      cash_expected: null,
      cash_reported: null,
      cash_variance: null,
      status: "ACTIVE",
    });
    expect(await context.countAudit(second.shift.shiftId, "SHIFT_ENDED")).toBe(
      0,
    );
  });

  it("limits runtime Shift updates to lifecycle and reconciliation columns", async () => {
    const { shift } = await cashShift();
    await expect(
      context.runtimePool.query(
        `UPDATE shifts SET started_at = started_at WHERE id = $1`,
        [shift.shiftId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
