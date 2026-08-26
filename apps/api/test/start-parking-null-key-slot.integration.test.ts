import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStartParkingCommandExecutor } from "../src/modules/parking/start-parking-command";
import {
  expectStartParkingError,
  StartParkingTestContext,
} from "./start-parking-test-context";

const context = new StartParkingTestContext("null_key_slot");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function loadCustodyEvents(sessionId: string) {
  const custody = await context.adminPool.query(
    `SELECT event_type::text FROM key_custody_events
     WHERE valet_session_id = $1`,
    [sessionId],
  );
  return custody.rows;
}

describe("DEC-068 Start Parking with a NULL key_slot_id", () => {
  it("starts Parking keeping the session unbound and custody-silent", async () => {
    const fixture = await context.createStartParkingFixture({
      assignKey: false,
    });
    const result = await context.start(fixture, { session: 1 });
    expect(result).toEqual({
      parkingStartedAt: expect.any(String),
      sessionId: fixture.sessionId,
      sessionVersion: 2,
      state: "PARKING",
      taskId: fixture.taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    });
    const effects = await context.effects(fixture);
    expect(effects.projection).toMatchObject({
      current_assignee_membership_id: null,
      key_slot_id: null,
      parked_at: null,
      parking_spot_id: null,
      parking_zone_id: null,
      session_state: "PARKING",
      session_version: 2,
      task_assignee: fixture.membershipId,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.projection.parking_started_at?.toISOString()).toBe(
      result.parkingStartedAt,
    );
    expect(await loadCustodyEvents(fixture.sessionId)).toEqual([]);
    const dispatch = await context.adminPool.query(
      `SELECT actor_membership_id::text FROM dispatch_events
       WHERE task_id = $1 AND event_type = 'IN_PROGRESS'`,
      [fixture.taskId],
    );
    expect(dispatch.rows).toEqual([
      { actor_membership_id: fixture.membershipId },
    ]);
    const audit = await context.adminPool.query<{ metadata_json: object }>(
      `SELECT metadata_json FROM audit_events
       WHERE valet_session_id = $1
         AND event_type = 'VALET_SESSION_PARKING_STARTED'`,
      [fixture.sessionId],
    );
    expect(audit.rows[0]?.metadata_json).toEqual({
      fromSessionState: "AWAITING_PARKING",
      fromSessionVersion: 1,
      fromTaskStatus: "ACCEPTED",
      fromTaskVersion: 3,
      taskId: fixture.taskId,
      toSessionState: "PARKING",
      toSessionVersion: 2,
      toTaskStatus: "IN_PROGRESS",
      toTaskVersion: 4,
    });
    expect(
      new Set(effects.events.map((event) => event.occurred_at.getTime())).size,
    ).toBe(1);
  });

  it("returns VERSION_CONFLICT on stale-version retries and appends nothing", async () => {
    const fixture = await context.createStartParkingFixture({
      assignKey: false,
    });
    await context.start(fixture, { session: 1 });
    const before = await context.effects(fixture);
    await expectStartParkingError(
      context.start(fixture, { session: 1 }),
      "VERSION_CONFLICT",
    );
    await expectStartParkingError(
      context.start(fixture, { session: 2, task: 3 }),
      "VERSION_CONFLICT",
    );
    await expectStartParkingError(
      context.start(fixture, { session: 1, task: 4 }),
      "VERSION_CONFLICT",
    );
    const after = await context.effects(fixture);
    expect(after.events).toEqual(before.events);
    expect(await loadCustodyEvents(fixture.sessionId)).toEqual([]);
  });

  it("conceals a non-owner member behind TASK_NOT_FOUND_OR_FORBIDDEN", async () => {
    const fixture = await context.createStartParkingFixture({
      assignKey: false,
    });
    const other = await context.addMember(fixture);
    await expectStartParkingError(
      createStartParkingCommandExecutor(context.runtimePool)({
        authenticatedUserId: other.userId,
        expectedSessionVersion: 1,
        expectedTaskVersion: 3,
        sessionId: fixture.sessionId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const effects = await context.effects(fixture);
    expect(effects.projection).toMatchObject({
      key_slot_id: null,
      session_state: "AWAITING_PARKING",
      session_version: 1,
      task_status: "ACCEPTED",
      task_version: 3,
    });
    expect(effects.events).toEqual([]);
    expect(await loadCustodyEvents(fixture.sessionId)).toEqual([]);
  });

  it.each([
    [
      "ended Shift",
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1`,
    ],
    [
      "inactive membership",
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
    ],
  ])("blocks the unbound owner after %s", async (_name, sql) => {
    const fixture = await context.createStartParkingFixture({
      assignKey: false,
    });
    await context.adminPool.query(sql, [fixture.membershipId]);
    await expectStartParkingError(
      context.start(fixture, { session: 1 }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const effects = await context.effects(fixture);
    expect(effects.projection).toMatchObject({
      key_slot_id: null,
      session_state: "AWAITING_PARKING",
      session_version: 1,
      task_status: "ACCEPTED",
      task_version: 3,
    });
    expect(effects.events).toEqual([]);
    expect(await loadCustodyEvents(fixture.sessionId)).toEqual([]);
  });

  it("rolls back every effect when the audit append fails", async () => {
    const duplicateAuditEventId = randomUUID();
    const first = await context.createStartParkingFixture({
      assignKey: false,
    });
    await context.start(
      first,
      { session: 1 },
      { auditEventIdFactory: () => duplicateAuditEventId },
    );
    const second = await context.createStartParkingFixture({
      assignKey: false,
    });
    await expect(
      context.start(
        second,
        { session: 1 },
        { auditEventIdFactory: () => duplicateAuditEventId },
      ),
    ).rejects.toMatchObject({ code: "23505" });
    const effects = await context.effects(second);
    expect(effects.projection).toMatchObject({
      key_slot_id: null,
      parking_started_at: null,
      session_state: "AWAITING_PARKING",
      session_version: 1,
      task_status: "ACCEPTED",
      task_version: 3,
    });
    expect(effects.events).toEqual([]);
    expect(await loadCustodyEvents(second.sessionId)).toEqual([]);
  });

  it("allows exactly one of two simultaneous unbound Start Parking calls", async () => {
    const fixture = await context.createStartParkingFixture({
      assignKey: false,
    });
    const results = await Promise.allSettled([
      context.start(fixture, { session: 1 }),
      context.start(fixture, { session: 1 }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const effects = await context.effects(fixture);
    expect(effects.projection).toMatchObject({
      key_slot_id: null,
      session_state: "PARKING",
      session_version: 2,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.events.map((event) => event.event_type).sort()).toEqual([
      "IN_PROGRESS",
      "VALET_SESSION_PARKING_STARTED",
    ]);
    expect(await loadCustodyEvents(fixture.sessionId)).toEqual([]);
  });
});
