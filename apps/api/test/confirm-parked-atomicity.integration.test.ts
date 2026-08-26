import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  ConfirmParkedTestContext,
  expectConfirmError,
} from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("atomicity");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function withRejectingUpdateTrigger(
  table: "tasks" | "valet_sessions",
  operation: () => Promise<unknown>,
) {
  const name = `reject_confirm_parked_${table}`;
  await context.adminPool.query(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'injected confirm parked failure'; END $$;
     CREATE TRIGGER ${name} BEFORE UPDATE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION ${name}()`,
  );
  try {
    await operation();
  } finally {
    await context.adminPool.query(
      `DROP TRIGGER ${name} ON ${table}; DROP FUNCTION ${name}()`,
    );
  }
}

describe("VAL-005G atomic rollback and retry", () => {
  it.each(["tasks", "valet_sessions"] as const)(
    "rolls back all effects when %s mutation fails",
    async (table) => {
      const fixture = await context.createConfirmParkedFixture();
      await withRejectingUpdateTrigger(table, async () => {
        await expect(context.confirm(fixture)).rejects.toThrow(
          "injected confirm parked failure",
        );
      });
      const effects = await context.completionEffects(fixture);
      expect(effects.projection).toMatchObject({
        parked_at: null,
        parking_spot_id: null,
        session_state: "PARKING",
        session_version: 3,
        task_status: "IN_PROGRESS",
        task_version: 4,
      });
      expect(effects.events).toEqual([]);
    },
  );

  it.each([
    "custodyEventIdFactory",
    "dispatchEventIdFactory",
    "auditEventIdFactory",
  ] as const)("rolls back all effects when %s fails", async (factory) => {
    const duplicateId = randomUUID();
    const first = await context.createConfirmParkedFixture();
    await context.confirm(first, {}, { [factory]: () => duplicateId });
    const second = await context.createConfirmParkedFixture();
    await expect(
      context.confirm(second, {}, { [factory]: () => duplicateId }),
    ).rejects.toMatchObject({ code: "23505" });
    const effects = await context.completionEffects(second);
    expect(effects.projection).toMatchObject({
      parked_at: null,
      parking_spot_id: null,
      session_state: "PARKING",
      task_status: "IN_PROGRESS",
    });
    expect(effects.events).toEqual([]);
  });

  it("maps old retry to version conflict and refreshed retry to invalid state", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.confirm(fixture);
    await expectConfirmError(context.confirm(fixture), "VERSION_CONFLICT");
    await expectConfirmError(
      context.confirm(fixture, { sessionVersion: 4, taskVersion: 5 }),
      "TASK_INVALID_STATE",
    );
    expect((await context.completionEffects(fixture)).events).toHaveLength(3);
  });
});

describe("VAL-005G concurrency", () => {
  it("commits one event set for concurrent same-session confirmation", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const results = await Promise.allSettled([
      context.confirm(fixture),
      context.confirm(fixture),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await context.completionEffects(fixture)).events).toHaveLength(3);
  });

  it("allows only one session to claim a contested free Spot", async () => {
    const first = await context.createConfirmParkedFixture();
    const second = await context.createCompetingFixture(first);
    const results = await Promise.allSettled([
      context.confirm(first),
      context.confirm(second),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected");
    expect(loser).toMatchObject({
      reason: { code: "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE" },
    });
  });

  it("serializes safely with Shift end and permits end after completion", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    const end = () =>
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: shift.rows[0]!.id,
      });
    const results = await Promise.allSettled([context.confirm(fixture), end()]);
    if (results[0]?.status === "fulfilled")
      await expect(end()).resolves.toBeDefined();
    const effects = await context.completionEffects(fixture);
    const shiftState = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM shifts WHERE id = $1`,
      [shift.rows[0]!.id],
    );
    expect({
      session: effects.projection.session_state,
      shift: shiftState.rows[0]?.status,
    }).not.toEqual({ session: "PARKED", shift: "ACTIVE" });
  });

  it("serializes a binding-mode confirmation with Shift end (DEC-068 §29.13)", async () => {
    const fixture = await context.createPostBindingFixture();
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    const end = () =>
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: shift.rows[0]!.id,
      });
    const results = await Promise.allSettled([
      context.confirm(fixture, { sessionVersion: 2, taskVersion: 4 }),
      end(),
    ]);
    if (results[0]?.status === "fulfilled") {
      await expect(end()).resolves.toBeDefined();
      const effects = await context.completionEffects(fixture);
      expect(effects.projection.task_status).toBe("COMPLETED");
    }
    const finalEffects = await context.completionEffects(fixture);
    const shiftState = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM shifts WHERE id = $1`,
      [shift.rows[0]!.id],
    );
    // Exactly one operation wins: a PARKED session never coexists with an
    // ACTIVE Shift owned by the same acting membership.
    expect({
      session: finalEffects.projection.session_state,
      shift: shiftState.rows[0]?.status,
    }).not.toEqual({ session: "PARKED", shift: "ACTIVE" });
  });

  it("appends exactly one slot-assignment audit on legacy confirmation", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.confirm(fixture);
    const audits = await context.adminPool.query<{
      count: number;
      event_type: string;
    }>(
      `SELECT event_type::text, count(*)::integer AS count
       FROM audit_events
       WHERE valet_session_id = $1
         AND event_type IN
           ('VALET_SESSION_KEY_SLOT_ASSIGNED', 'VALET_SESSION_PARKED')
       GROUP BY 1 ORDER BY 1`,
      [fixture.sessionId],
    );
    // One assignment audit from the original DEC-033 assign command only;
    // legacy Confirm Parked must not duplicate it (DEC-068 §17).
    expect(audits.rows).toEqual([
      { count: 1, event_type: "VALET_SESSION_KEY_SLOT_ASSIGNED" },
      { count: 1, event_type: "VALET_SESSION_PARKED" },
    ]);
  });

  it("preserves the IN_PROGRESS reassignment boundary", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    const target = await context.addMember(fixture);
    await expect(
      createReassignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: supervisor.userId,
        expectedVersion: 4,
        reason: "not allowed",
        targetAssigneeMembershipId: target.membershipId,
        taskId: fixture.taskId,
      }),
    ).rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
    await expect(context.confirm(fixture)).resolves.toBeDefined();
  });
});
