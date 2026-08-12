import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createConfirmParkedCommandExecutor } from "../src/modules/parking/confirm-parked-command";
import {
  ConfirmParkedTestContext,
  expectConfirmError,
} from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("command");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005G Confirm Parked success", () => {
  it("atomically completes Parking with exact Zone, Spot, and versions", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const result = await context.confirm(fixture, {
      code: `  ${fixture.parkingSpotCode}  `,
    });
    expect(result).toEqual({
      parkedAt: expect.any(String),
      parkingSpotCode: fixture.parkingSpotCode,
      parkingSpotId: fixture.parkingSpotId,
      parkingZoneId: fixture.parkingZoneId,
      sessionId: fixture.sessionId,
      sessionVersion: 4,
      state: "PARKED",
      taskId: fixture.taskId,
      taskStatus: "COMPLETED",
      taskVersion: 5,
    });
    const effects = await context.completionEffects(fixture);
    expect(effects.projection).toMatchObject({
      current_assignee_membership_id: null,
      key_slot_id: fixture.keySlotId,
      parking_spot_id: fixture.parkingSpotId,
      parking_zone_id: fixture.parkingZoneId,
      session_state: "PARKED",
      session_version: 4,
      task_assignee: fixture.membershipId,
      task_status: "COMPLETED",
      task_version: 5,
    });
    expect((effects.projection.parked_at as Date).toISOString()).toBe(
      result.parkedAt,
    );
    expect(effects.projection.parking_started_at).not.toBeNull();
    expect(effects.events.map((event) => event.event_type).sort()).toEqual([
      "COMPLETED",
      "RETURNED_TO_SLOT",
      "VALET_SESSION_PARKED",
    ]);
    expect(
      new Set(effects.events.map((event) => event.occurred_at.getTime())).size,
    ).toBe(1);
  });

  it("writes exact custody, Dispatch, and narrow Audit facts", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.confirm(fixture);
    const custody = await context.adminPool.query(
      `SELECT key_slot_id::text, actor_membership_id::text
       FROM key_custody_events WHERE valet_session_id = $1
         AND event_type = 'RETURNED_TO_SLOT'`,
      [fixture.sessionId],
    );
    expect(custody.rows).toEqual([
      {
        actor_membership_id: fixture.membershipId,
        key_slot_id: fixture.keySlotId,
      },
    ]);
    const dispatch = await context.adminPool.query(
      `SELECT actor_membership_id::text, previous_assignee_membership_id::text,
              new_assignee_membership_id::text, reason
       FROM dispatch_events WHERE task_id = $1 AND event_type = 'COMPLETED'`,
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
      `SELECT metadata_json FROM audit_events WHERE valet_session_id = $1
         AND event_type = 'VALET_SESSION_PARKED'`,
      [fixture.sessionId],
    );
    expect(audit.rows[0]?.metadata_json).toEqual({
      fromSessionState: "PARKING",
      fromSessionVersion: 3,
      fromTaskStatus: "IN_PROGRESS",
      fromTaskVersion: 4,
      parkingSpotId: fixture.parkingSpotId,
      parkingZoneId: fixture.parkingZoneId,
      taskId: fixture.taskId,
      toSessionState: "PARKED",
      toSessionVersion: 4,
      toTaskStatus: "COMPLETED",
      toTaskVersion: 5,
    });
  });
});

describe("VAL-005G authorization and precedence", () => {
  it("conceals non-owner, supervisor-other, and foreign tenant access", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    const foreign = await context.createConfirmParkedFixture();
    const execute = createConfirmParkedCommandExecutor(context.runtimePool);
    for (const authenticatedUserId of [supervisor.userId, foreign.userId]) {
      await expectConfirmError(
        execute({
          authenticatedUserId,
          expectedSessionVersion: 3,
          expectedTaskVersion: 4,
          parkingSpotCode: fixture.parkingSpotCode,
          sessionId: fixture.sessionId,
        }),
        "TASK_NOT_FOUND_OR_FORBIDDEN",
      );
    }
  });

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "does not grant %s field authority",
    async (role) => {
      const fixture = await context.createConfirmParkedFixture();
      const actor = await context.addMember(fixture, role, false);
      await expectConfirmError(
        createConfirmParkedCommandExecutor(context.runtimePool)({
          authenticatedUserId: actor.userId,
          expectedSessionVersion: 3,
          expectedTaskVersion: 4,
          parkingSpotCode: fixture.parkingSpotCode,
          sessionId: fixture.sessionId,
        }),
        "TASK_NOT_FOUND_OR_FORBIDDEN",
      );
    },
  );

  it.each([
    [
      "ended Shift",
      `UPDATE shifts SET status = 'ENDED', ended_at = now() WHERE membership_id = $1`,
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
    const fixture = await context.createConfirmParkedFixture();
    await context.adminPool.query(sql, [fixture.membershipId]);
    await expectConfirmError(
      context.confirm(fixture),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });

  it("returns VERSION_CONFLICT before state/key/Spot detail", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = 'ACCEPTED' WHERE id = $1`,
      [fixture.taskId],
    );
    await context.adminPool.query(
      `UPDATE valet_sessions SET state = 'PARKED', key_slot_id = NULL WHERE id = $1`,
      [fixture.sessionId],
    );
    await expectConfirmError(
      context.confirm(fixture, {
        code: randomUUID(),
        sessionVersion: 2,
        taskVersion: 3,
      }),
      "VERSION_CONFLICT",
    );
  });
});
