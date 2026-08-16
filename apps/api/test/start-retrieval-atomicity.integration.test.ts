import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  expectStartRetrievalError,
  StartRetrievalTestContext,
} from "./start-retrieval-test-context";

const context = new StartRetrievalTestContext("atomicity");

async function withRejectingUpdateTrigger(
  table: "retrieval_requests" | "tasks" | "valet_sessions",
  operation: () => Promise<unknown>,
) {
  const functionName = `reject_start_retrieval_${table}`;
  await context.adminPool.query(
    `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'injected start retrieval failure'; END $$;
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

describe("VAL-006D atomic rollback and concurrency", () => {
  it.each(["tasks", "valet_sessions", "retrieval_requests"] as const)(
    "rolls back every effect when the %s projection mutation fails",
    async (table) => {
      const fixture = await context.createStartRetrievalFixture();
      await withRejectingUpdateTrigger(table, async () => {
        await expect(context.startRetrieval(fixture)).rejects.toThrow(
          "injected start retrieval failure",
        );
      });
      const effects = await context.retrievalEffects(fixture);
      expect(effects.projection).toMatchObject({
        parking_spot_id: fixture.parkingSpotId,
        request_status: "OPEN",
        retrieval_started_at: null,
        session_state: "REQUESTED",
        session_version: 5,
        task_status: "ACCEPTED",
        task_version: 3,
      });
      expect(effects.history).toEqual([]);
    },
  );

  it.each([
    "custodyEventIdFactory",
    "dispatchEventIdFactory",
    "auditEventIdFactory",
  ] as const)("rolls back every effect when %s fails", async (factory) => {
    const duplicateId = randomUUID();
    const first = await context.createStartRetrievalFixture();
    await context.startRetrieval(first, {}, { [factory]: () => duplicateId });
    const second = await context.createStartRetrievalFixture();
    await expect(
      context.startRetrieval(second, {}, { [factory]: () => duplicateId }),
    ).rejects.toMatchObject({ code: "23505" });
    const effects = await context.retrievalEffects(second);
    expect(effects.projection).toMatchObject({
      key_slot_id: second.keySlotId,
      parking_spot_id: second.parkingSpotId,
      request_status: "OPEN",
      retrieval_started_at: null,
      session_state: "REQUESTED",
      session_version: 5,
      task_status: "ACCEPTED",
      task_version: 3,
    });
    expect(effects.history).toEqual([]);
  });

  it("allows only one simultaneous winner and no duplicate history", async () => {
    const fixture = await context.createStartRetrievalFixture();
    const results = await Promise.allSettled([
      context.startRetrieval(fixture),
      context.startRetrieval(fixture),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const effects = await context.retrievalEffects(fixture);
    expect(effects.history).toHaveLength(3);
    expect(effects.counts).toEqual({ request_count: 1, task_count: 1 });
    await expectStartRetrievalError(
      context.startRetrieval(fixture),
      "VERSION_CONFLICT",
    );
    expect((await context.retrievalEffects(fixture)).history).toHaveLength(3);
  });

  it("serializes safely against supervisor reassignment", async () => {
    const fixture = await context.createStartRetrievalFixture();
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    const target = await context.addMember(fixture);
    const results = await Promise.allSettled([
      context.startRetrieval(fixture),
      createReassignTaskCommandExecutor(context.runtimePool)({
        authenticatedUserId: supervisor.userId,
        expectedVersion: 3,
        reason: "retrieval race handoff",
        targetAssigneeMembershipId: target.membershipId,
        taskId: fixture.retrievalTaskId,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const projection = (await context.retrievalEffects(fixture)).projection;
    if (projection.task_status === "IN_PROGRESS") {
      expect(projection.task_assignee).toBe(fixture.membershipId);
      expect(projection.session_state).toBe("RETRIEVING");
    } else {
      expect(projection.task_assignee).toBe(target.membershipId);
      expect(projection.session_state).toBe("REQUESTED");
      expect(projection.request_status).toBe("OPEN");
    }
  });

  it("serializes safely against Shift end and blocks it after success", async () => {
    const fixture = await context.createStartRetrievalFixture();
    const shift = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      [fixture.membershipId],
    );
    const end = () =>
      createEndShiftCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        cashReported: "0",
        shiftId: shift.rows[0]!.id,
      });
    const results = await Promise.allSettled([
      context.startRetrieval(fixture),
      end(),
    ]);
    const effects = await context.retrievalEffects(fixture);
    const shiftState = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM shifts WHERE id = $1`,
      [shift.rows[0]!.id],
    );
    expect({
      session: effects.projection.session_state,
      shift: shiftState.rows[0]?.status,
    }).not.toEqual({ session: "RETRIEVING", shift: "ENDED" });
    if (results[0]?.status === "fulfilled") {
      await expect(end()).rejects.toMatchObject({
        code: "OPEN_TASK_HANDOFF_REQUIRED",
      });
    }
  });
});
