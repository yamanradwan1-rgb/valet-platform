import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConfirmParkedTestContext,
  expectConfirmError,
} from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("guards");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005G Task and session guards", () => {
  it("does not let a Retrieval Task satisfy Confirm Parked", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = 'CANCELLED',
         current_assignee_membership_id = NULL WHERE id = $1`,
      [fixture.taskId],
    );
    await context.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type,
          status, current_assignee_membership_id, version, updated_at)
       VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'IN_PROGRESS', $5, 1, now())`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
      ],
    );
    await expectConfirmError(
      context.confirm(fixture),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });

  it.each([
    ["QUEUED", "TASK_NOT_FOUND_OR_FORBIDDEN"],
    ["ASSIGNED", "TASK_INVALID_STATE"],
    ["ACCEPTED", "TASK_INVALID_STATE"],
  ])("rejects %s Parking Task", async (status, errorCode) => {
    const fixture = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = $2::task_status,
           current_assignee_membership_id = CASE WHEN $2::task_status = 'QUEUED' THEN NULL
             ELSE current_assignee_membership_id END
         WHERE id = $1`,
      [fixture.taskId, status],
    );
    await expectConfirmError(context.confirm(fixture), errorCode);
  });

  it.each(["AWAITING_PARKING", "PARKED", "REQUESTED"])(
    "rejects session state %s",
    async (state) => {
      const fixture = await context.createConfirmParkedFixture();
      await context.adminPool.query(
        `UPDATE valet_sessions SET state = $2 WHERE id = $1`,
        [fixture.sessionId, state],
      );
      await expectConfirmError(
        context.confirm(fixture),
        "INVALID_STATE_TRANSITION",
      );
    },
  );

  it.each([
    ["missing start", `parking_started_at = NULL`, []],
    ["already parked", `parked_at = now()`, []],
    [
      "pre-existing Spot",
      `parking_zone_id = $2, parking_spot_id = $3`,
      ["zone", "spot"],
    ],
  ])(
    "rejects %s projection inconsistency",
    async (_name, assignment, parameters) => {
      const fixture = await context.createConfirmParkedFixture();
      await context.adminPool.query(
        `UPDATE valet_sessions SET ${assignment} WHERE id = $1`,
        parameters.length === 0
          ? [fixture.sessionId]
          : [fixture.sessionId, fixture.parkingZoneId, fixture.parkingSpotId],
      );
      await expectConfirmError(
        context.confirm(fixture),
        "INVALID_STATE_TRANSITION",
      );
    },
  );

  it("binds an unbound session from free-slot evidence and rejects unusable assignments", async () => {
    const unbound = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions SET key_slot_id = NULL WHERE id = $1`,
      [unbound.sessionId],
    );
    await context.confirm(unbound);
    const boundEffects = await context.completionEffects(unbound);
    expect(boundEffects.projection).toMatchObject({
      key_slot_id: unbound.keySlotId,
      session_state: "PARKED",
      session_version: 4,
      task_status: "COMPLETED",
      task_version: 5,
    });
    expect(
      boundEffects.events.filter(
        (event) => event.event_type === "RETURNED_TO_SLOT",
      ),
    ).toHaveLength(1);
    // The original key-slot/assign command already appended one SLOT_ASSIGNED;
    // Confirm Parked must add exactly one more for the re-binding.
    const assignedAfterRebinding = await context.adminPool.query<{
      count: number;
    }>(
      `SELECT count(*)::integer AS count FROM key_custody_events
       WHERE valet_session_id = $1 AND event_type = 'SLOT_ASSIGNED'`,
      [unbound.sessionId],
    );
    expect(assignedAfterRebinding.rows[0]?.count).toBe(2);
    const inactive = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE key_slots SET status = 'INACTIVE' WHERE id = $1`,
      [inactive.keySlotId],
    );
    await expectConfirmError(
      context.confirm(inactive),
      "KEY_CUSTODY_NOT_READY",
    );
    const untouchedEffects = await context.completionEffects(inactive);
    expect(untouchedEffects.projection).toMatchObject({
      key_slot_id: inactive.keySlotId,
      session_state: "PARKING",
      session_version: 3,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
  });
});

describe("VAL-005G exact ParkingSpot and Zone proof", () => {
  it("trims only and rejects case, partial, and unknown codes", async () => {
    const fixture = await context.createConfirmParkedFixture();
    for (const code of [
      fixture.parkingSpotCode.toLowerCase(),
      fixture.parkingSpotCode.slice(0, -1),
      randomUUID(),
    ]) {
      await expectConfirmError(
        context.confirm(fixture, { code }),
        "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
      );
    }
  });

  it.each([
    ["inactive Spot", { spotStatus: "INACTIVE" as const }],
    ["zone-null Spot", { withZone: false }],
    ["inactive Zone", { zoneStatus: "INACTIVE" as const }],
  ])("rejects %s without detail", async (_name, options) => {
    const fixture = await context.createConfirmParkedFixture(options);
    await expectConfirmError(
      context.confirm(fixture),
      "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
    );
  });

  it("rejects a mismatched preassigned Zone", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const other = await context.addParkingResource(fixture);
    await context.adminPool.query(
      `UPDATE valet_sessions SET parking_zone_id = $2 WHERE id = $1`,
      [fixture.sessionId, other.zone.id],
    );
    await expectConfirmError(
      context.confirm(fixture),
      "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
    );
  });

  it("conceals wrong-Location and occupied Spots", async () => {
    const target = await context.createConfirmParkedFixture();
    const other = await context.createConfirmParkedFixture();
    await expectConfirmError(
      context.confirm(target, { code: other.parkingSpotCode }),
      "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
    );
    const occupantId = await context.addSession(target, "PARKED");
    await context.adminPool.query(
      `UPDATE valet_sessions SET parking_zone_id = $2, parking_spot_id = $3
       WHERE id = $1`,
      [occupantId, target.parkingZoneId, target.parkingSpotId],
    );
    await expectConfirmError(
      context.confirm(target),
      "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
    );
  });
});
