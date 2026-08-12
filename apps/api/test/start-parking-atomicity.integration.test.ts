import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  expectStartParkingError,
  StartParkingTestContext,
} from "./start-parking-test-context";

const context = new StartParkingTestContext("atomicity");

async function withRejectingUpdateTrigger(
  table: "tasks" | "valet_sessions",
  operation: () => Promise<unknown>,
) {
  const functionName = `reject_start_parking_${table}`;
  await context.adminPool.query(
    `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'injected start parking failure'; END $$;
     CREATE TRIGGER ${functionName} BEFORE UPDATE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
  );
  try {
    await operation();
  } finally {
    await context.adminPool.query(
      `DROP TRIGGER ${functionName} ON ${table};
       DROP FUNCTION ${functionName}()`,
    );
  }
}

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005F atomic rollback", () => {
  it.each(["tasks", "valet_sessions"] as const)(
    "rolls back every effect when the %s projection mutation fails",
    async (table) => {
      const fixture = await context.createStartParkingFixture();
      await withRejectingUpdateTrigger(table, async () => {
        await expect(context.start(fixture)).rejects.toThrow(
          "injected start parking failure",
        );
      });
      const effects = await context.effects(fixture);
      expect(effects.projection).toMatchObject({
        parking_started_at: null,
        session_state: "AWAITING_PARKING",
        session_version: 2,
        task_status: "ACCEPTED",
        task_version: 3,
      });
      expect(effects.events).toEqual([]);
    },
  );

  it.each([
    "custodyEventIdFactory",
    "dispatchEventIdFactory",
    "auditEventIdFactory",
  ] as const)("rolls back every effect when %s fails", async (factory) => {
    const duplicateId = randomUUID();
    const first = await context.createStartParkingFixture();
    await context.start(first, {}, { [factory]: () => duplicateId });
    const second = await context.createStartParkingFixture();
    await expect(
      context.start(second, {}, { [factory]: () => duplicateId }),
    ).rejects.toMatchObject({ code: "23505" });
    const effects = await context.effects(second);
    expect(effects.projection).toMatchObject({
      key_slot_id: second.keySlotId,
      parking_started_at: null,
      session_state: "AWAITING_PARKING",
      session_version: 2,
      task_status: "ACCEPTED",
      task_version: 3,
    });
    expect(effects.events).toEqual([]);
  });

  it("old-version retry conflicts and refreshed retry adds no duplicate events", async () => {
    const fixture = await context.createStartParkingFixture();
    await context.start(fixture);
    await expectStartParkingError(context.start(fixture), "VERSION_CONFLICT");
    await expectStartParkingError(
      context.start(fixture, { session: 3, task: 4 }),
      "TASK_INVALID_STATE",
    );
    expect((await context.effects(fixture)).events).toHaveLength(3);
  });
});

describe("VAL-005F concurrency safety", () => {
  it("allows exactly one of two simultaneous Start Parking calls", async () => {
    const fixture = await context.createStartParkingFixture();
    const results = await Promise.allSettled([
      context.start(fixture),
      context.start(fixture),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await context.effects(fixture)).events).toHaveLength(3);
  });

  it("serializes safely against supervisor reassignment", async () => {
    const fixture = await context.createStartParkingFixture();
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    const target = await context.addMember(fixture);
    const results = await Promise.allSettled([
      context.start(fixture),
      createReassignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: supervisor.userId,
        expectedVersion: 3,
        reason: "race handoff",
        targetAssigneeMembershipId: target.membershipId,
        taskId: fixture.taskId,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const effects = await context.effects(fixture);
    if (effects.projection.task_status === "IN_PROGRESS") {
      expect(effects.projection.task_assignee).toBe(fixture.membershipId);
      expect(effects.projection.session_state).toBe("PARKING");
    } else {
      expect(effects.projection.task_assignee).toBe(target.membershipId);
      expect(effects.projection.session_state).toBe("AWAITING_PARKING");
    }
  });

  it("serializes safely against Task acceptance", async () => {
    const fixture = await context.createStartParkingFixture({
      acceptTask: false,
    });
    const results = await Promise.allSettled([
      context.start(fixture, { task: 3 }),
      createAcceptTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 2,
        taskId: fixture.taskId,
      }),
    ]);
    const effects = await context.effects(fixture);
    expect(
      results.filter((result) => result.status === "fulfilled").length,
    ).toBeGreaterThanOrEqual(1);
    expect([
      ["ACCEPTED", "AWAITING_PARKING"],
      ["IN_PROGRESS", "PARKING"],
    ]).toContainEqual([
      effects.projection.task_status,
      effects.projection.session_state,
    ]);
  });

  it("serializes safely against KeySlot correction", async () => {
    const fixture = await context.createStartParkingFixture();
    const replacement = await context.addKeySlot(fixture);
    const results = await Promise.allSettled([
      context.start(fixture),
      createAssignKeySlotCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 2,
        keySlotCode: replacement.code,
        sessionId: fixture.sessionId,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const effects = await context.effects(fixture);
    if (effects.projection.session_state === "PARKING") {
      expect(effects.projection.key_slot_id).toBe(fixture.keySlotId);
      expect(effects.events).toHaveLength(3);
    } else {
      expect(effects.projection.key_slot_id).toBe(replacement.id);
      expect(effects.events).toEqual([]);
    }
  });

  it("serializes safely against Shift end and blocks end after success", async () => {
    const fixture = await context.createStartParkingFixture();
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    const end = () =>
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        shiftId: shift.rows[0]!.id,
      });
    const results = await Promise.allSettled([context.start(fixture), end()]);
    const effects = await context.effects(fixture);
    const shiftState = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM shifts WHERE id = $1`,
      [shift.rows[0]!.id],
    );
    expect({
      session: effects.projection.session_state,
      shift: shiftState.rows[0]?.status,
    }).not.toEqual({ session: "PARKING", shift: "ENDED" });
    if (results[0]?.status === "fulfilled") {
      await expect(end()).rejects.toMatchObject({
        code: "OPEN_TASK_HANDOFF_REQUIRED",
      });
    }
  });
});
