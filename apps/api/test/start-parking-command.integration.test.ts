import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStartParkingCommandExecutor } from "../src/modules/parking/start-parking-command";
import {
  expectStartParkingError,
  StartParkingTestContext,
} from "./start-parking-test-context";

const context = new StartParkingTestContext("command");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005F Start Parking success", () => {
  it("atomically starts the accepted Task owner's physical Parking", async () => {
    const fixture = await context.createStartParkingFixture();
    const result = await context.start(fixture);
    expect(result).toEqual({
      parkingStartedAt: expect.any(String),
      sessionId: fixture.sessionId,
      sessionVersion: 3,
      state: "PARKING",
      taskId: fixture.taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    });
    const effects = await context.effects(fixture);
    expect(effects.projection).toMatchObject({
      current_assignee_membership_id: null,
      key_slot_id: fixture.keySlotId,
      parked_at: null,
      parking_spot_id: null,
      parking_zone_id: null,
      session_state: "PARKING",
      session_version: 3,
      task_assignee: fixture.membershipId,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.projection.parking_started_at?.toISOString()).toBe(
      result.parkingStartedAt,
    );
    expect(effects.events.map((event) => event.event_type).sort()).toEqual([
      "CHECKED_OUT",
      "IN_PROGRESS",
      "VALET_SESSION_PARKING_STARTED",
    ]);
    expect(
      new Set(effects.events.map((event) => event.occurred_at.getTime())).size,
    ).toBe(1);
  });

  it("writes exact custody, Dispatch, and narrow Audit facts", async () => {
    const fixture = await context.createStartParkingFixture();
    await context.start(fixture);
    const custody = await context.adminPool.query(
      `SELECT key_slot_id::text, actor_membership_id::text
       FROM key_custody_events
       WHERE valet_session_id = $1 AND event_type = 'CHECKED_OUT'`,
      [fixture.sessionId],
    );
    expect(custody.rows).toEqual([
      {
        actor_membership_id: fixture.membershipId,
        key_slot_id: fixture.keySlotId,
      },
    ]);
    const dispatch = await context.adminPool.query(
      `SELECT actor_membership_id::text,
              previous_assignee_membership_id::text,
              new_assignee_membership_id::text, reason
       FROM dispatch_events
       WHERE task_id = $1 AND event_type = 'IN_PROGRESS'`,
      [fixture.taskId],
    );
    expect(dispatch.rows).toEqual([
      {
        actor_membership_id: fixture.membershipId,
        new_assignee_membership_id: fixture.membershipId,
        previous_assignee_membership_id: null,
        reason: null,
      },
    ]);
    const audit = await context.adminPool.query<{ metadata_json: object }>(
      `SELECT metadata_json FROM audit_events
       WHERE valet_session_id = $1
         AND event_type = 'VALET_SESSION_PARKING_STARTED'`,
      [fixture.sessionId],
    );
    expect(audit.rows[0]?.metadata_json).toEqual({
      fromSessionState: "AWAITING_PARKING",
      fromSessionVersion: 2,
      fromTaskStatus: "ACCEPTED",
      fromTaskVersion: 3,
      taskId: fixture.taskId,
      toSessionState: "PARKING",
      toSessionVersion: 3,
      toTaskStatus: "IN_PROGRESS",
      toTaskVersion: 4,
    });
  });
});

describe("VAL-005F authorization and guard precedence", () => {
  it("conceals non-owner, supervisor-other, and foreign tenant access", async () => {
    const fixture = await context.createStartParkingFixture();
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    const foreign = await context.createStartParkingFixture();
    const execute = createStartParkingCommandExecutor(context.runtimePool);
    for (const authenticatedUserId of [supervisor.userId, foreign.userId]) {
      await expectStartParkingError(
        execute({
          authenticatedUserId,
          expectedSessionVersion: 2,
          expectedTaskVersion: 3,
          sessionId: fixture.sessionId,
        }),
        "TASK_NOT_FOUND_OR_FORBIDDEN",
      );
    }
  });

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "does not grant %s field-operation authority",
    async (role) => {
      const fixture = await context.createStartParkingFixture();
      const actor = await context.addMember(fixture, role, false);
      await expectStartParkingError(
        createStartParkingCommandExecutor(context.runtimePool)({
          authenticatedUserId: actor.userId,
          expectedSessionVersion: 2,
          expectedTaskVersion: 3,
          sessionId: fixture.sessionId,
        }),
        "TASK_NOT_FOUND_OR_FORBIDDEN",
      );
    },
  );

  it.each([
    [
      "ended Shift",
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp() WHERE membership_id = $1`,
    ],
    [
      "inactive membership",
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
    ],
    [
      "revoked access",
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
    ],
  ])("rejects the owner after %s", async (_name, sql) => {
    const fixture = await context.createStartParkingFixture();
    await context.adminPool.query(sql, [fixture.membershipId]);
    await expectStartParkingError(
      context.start(fixture),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });

  it("returns VERSION_CONFLICT before Task/session/key readiness", async () => {
    const fixture = await context.createStartParkingFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = $1`,
      [fixture.taskId],
    );
    await context.adminPool.query(
      `UPDATE valet_sessions SET state = 'PARKING', key_slot_id = NULL
       WHERE id = $1`,
      [fixture.sessionId],
    );
    await expectStartParkingError(
      context.start(fixture, { session: 1, task: 2 }),
      "VERSION_CONFLICT",
    );
  });

  it("requires ACCEPTED Task, AWAITING_PARKING session, and null start time", async () => {
    const assigned = await context.createStartParkingFixture({
      acceptTask: false,
    });
    await expectStartParkingError(
      context.start(assigned, { task: 2 }),
      "TASK_INVALID_STATE",
    );
    const parking = await context.createStartParkingFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions SET state = 'PARKING' WHERE id = $1`,
      [parking.sessionId],
    );
    await expectStartParkingError(
      context.start(parking),
      "INVALID_STATE_TRANSITION",
    );
    const inconsistent = await context.createStartParkingFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions SET parking_started_at = transaction_timestamp() WHERE id = $1`,
      [inconsistent.sessionId],
    );
    await expectStartParkingError(
      context.start(inconsistent),
      "INVALID_STATE_TRANSITION",
    );
  });

  it("starts without any Key Slot when none is assigned (DEC-068)", async () => {
    const unbound = await context.createStartParkingFixture({
      assignKey: false,
    });
    const result = await context.start(unbound, { session: 1 });
    expect(result).toEqual({
      parkingStartedAt: expect.any(String),
      sessionId: unbound.sessionId,
      sessionVersion: 2,
      state: "PARKING",
      taskId: unbound.taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    });
    const effects = await context.effects(unbound);
    expect(effects.projection).toMatchObject({
      key_slot_id: null,
      session_state: "PARKING",
      session_version: 2,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.projection.parking_started_at?.toISOString()).toBe(
      result.parkingStartedAt,
    );
    const custody = await context.adminPool.query(
      `SELECT event_type::text FROM key_custody_events
       WHERE valet_session_id = $1`,
      [unbound.sessionId],
    );
    expect(custody.rows).toEqual([]);
    expect(effects.events.map((event) => event.event_type).sort()).toEqual([
      "IN_PROGRESS",
      "VALET_SESSION_PARKING_STARTED",
    ]);
  });

  it("requires the assigned KeySlot to be active and exact", async () => {
    const inactive = await context.createStartParkingFixture();
    await context.adminPool.query(
      `UPDATE key_slots SET status = 'INACTIVE' WHERE id = $1`,
      [inactive.keySlotId],
    );
    await expectStartParkingError(
      context.start(inactive),
      "KEY_CUSTODY_NOT_READY",
    );
  });

  it("conceals missing active Parking Task and ignores Retrieval", async () => {
    const fixture = await context.createStartParkingFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = 'CANCELLED' WHERE id = $1`,
      [fixture.taskId],
    );
    await context.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type,
          status, current_assignee_membership_id, version, updated_at)
       VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'ACCEPTED', $5, 1,
               transaction_timestamp())`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
      ],
    );
    await expectStartParkingError(
      context.start(fixture),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });
});
