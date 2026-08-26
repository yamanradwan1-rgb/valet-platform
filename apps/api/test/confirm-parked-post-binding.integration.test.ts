import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ConfirmParkedCommandOptions } from "../src/modules/parking/confirm-parked-command";
import {
  ConfirmParkedTestContext,
  expectConfirmError,
} from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("postbinding");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function orderedIdFactory(seed: number) {
  let counter = seed;
  return () => {
    const suffix = counter.toString(16).padStart(12, "0");
    counter += 1;
    return `00000000-0000-0000-0000-${suffix}`;
  };
}

function confirmWithDeterministicIds(
  fixture: Awaited<ReturnType<typeof context.createPostBindingFixture>>,
  seed: number,
) {
  const options: ConfirmParkedCommandOptions = {
    auditEventIdFactory: orderedIdFactory(seed),
    custodyEventIdFactory: orderedIdFactory(seed + 10),
  };
  return context.confirm(
    fixture,
    { sessionVersion: 2, taskVersion: 4 },
    options,
  );
}

async function enableTrackingAndStartTracker(
  fixture: Awaited<ReturnType<typeof context.createPostBindingFixture>>,
) {
  await context.adminPool.query(
    `UPDATE organizations SET tracking_enabled = true WHERE id = $1`,
    [fixture.organizationId],
  );
  await context.adminPool.query(
    `INSERT INTO task_tracking_sessions
       (id, organization_id, location_id, valet_session_id, task_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      randomUUID(),
      fixture.organizationId,
      fixture.locationId,
      fixture.sessionId,
      fixture.taskId,
    ],
  );
}

describe("DEC-068 post-Parking Key Slot binding", () => {
  it("binds a free ACTIVE slot atomically with the full effect set", async () => {
    const fixture = await context.createPostBindingFixture();
    await enableTrackingAndStartTracker(fixture);
    const result = await confirmWithDeterministicIds(fixture, 1);
    expect(result).toEqual({
      parkedAt: expect.any(String),
      parkingSpotCode: fixture.parkingSpotCode,
      parkingSpotId: fixture.parkingSpotId,
      parkingZoneId: fixture.parkingZoneId,
      sessionId: fixture.sessionId,
      sessionVersion: 3,
      state: "PARKED",
      taskId: fixture.taskId,
      taskStatus: "COMPLETED",
      taskVersion: 5,
    });
    const effects = await context.completionEffects(fixture);
    expect(effects.projection).toMatchObject({
      key_slot_id: fixture.keySlotId,
      parking_spot_id: fixture.parkingSpotId,
      parking_zone_id: fixture.parkingZoneId,
      session_state: "PARKED",
      session_version: 3,
      task_assignee: fixture.membershipId,
      task_status: "COMPLETED",
      task_version: 5,
    });
    expect((effects.projection.parked_at as Date).toISOString()).toBe(
      result.parkedAt,
    );
    const custody = await context.adminPool.query<{
      actor_membership_id: string;
      event_type: string;
      key_slot_id: string;
      occurred_at: Date;
    }>(
      `SELECT event_type::text, key_slot_id::text,
              actor_membership_id::text, occurred_at
       FROM key_custody_events WHERE valet_session_id = $1 ORDER BY id`,
      [fixture.sessionId],
    );
    expect(custody.rows.map((event) => event.event_type)).toEqual([
      "SLOT_ASSIGNED",
      "RETURNED_TO_SLOT",
    ]);
    expect(
      custody.rows.every(
        (event) =>
          event.key_slot_id === fixture.keySlotId &&
          event.actor_membership_id === fixture.membershipId &&
          event.occurred_at.toISOString() === result.parkedAt,
      ),
    ).toBe(true);
    const audits = await context.adminPool.query<{
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT event_type, metadata_json FROM audit_events
       WHERE valet_session_id = $1
         AND event_type IN
           ('VALET_SESSION_KEY_SLOT_ASSIGNED', 'VALET_SESSION_PARKED')
       ORDER BY id`,
      [fixture.sessionId],
    );
    expect(audits.rows.map((audit) => audit.event_type)).toEqual([
      "VALET_SESSION_KEY_SLOT_ASSIGNED",
      "VALET_SESSION_PARKED",
    ]);
    expect(audits.rows[0]?.metadata_json).toEqual({
      currentKeySlotId: fixture.keySlotId,
      fromVersion: 2,
      previousKeySlotId: null,
      toVersion: 3,
    });
    const dispatch = await context.dispatchEvents(fixture.taskId);
    expect(
      dispatch.filter((event) => event.event_type === "COMPLETED"),
    ).toEqual([
      {
        actor_membership_id: fixture.membershipId,
        event_type: "COMPLETED",
        new_assignee_membership_id: fixture.membershipId,
        previous_assignee_membership_id: null,
        reason: null,
      },
    ]);
    const trackers = await context.adminPool.query<{
      ended_at: Date | null;
    }>(
      `SELECT ended_at FROM task_tracking_sessions WHERE valet_session_id = $1`,
      [fixture.sessionId],
    );
    expect(trackers.rows).toHaveLength(1);
    expect(trackers.rows[0]?.ended_at?.toISOString()).toBe(result.parkedAt);
  });

  it("accepts the deposited slot code with surrounding trim only", async () => {
    const fixture = await context.createPostBindingFixture();
    await context.confirm(
      fixture,
      {
        keySlotCode: `  ${fixture.keySlotCode}  `,
        sessionVersion: 2,
        taskVersion: 4,
      },
    );
    const bound = await context.adminPool.query<{ key_slot_id: string }>(
      `SELECT key_slot_id::text FROM valet_sessions WHERE id = $1`,
      [fixture.sessionId],
    );
    expect(bound.rows[0]?.key_slot_id).toBe(fixture.keySlotId);
  });

  it("rejects a case-mismatched code without side effects", async () => {
    const fixture = await context.createPostBindingFixture();
    await enableTrackingAndStartTracker(fixture);
    await expectConfirmError(
      context.confirm(fixture, {
        keySlotCode: fixture.keySlotCode.toLowerCase(),
        sessionVersion: 2,
        taskVersion: 4,
      }),
      "KEY_CUSTODY_NOT_READY",
    );
    const effects = await context.completionEffects(fixture);
    expect(effects.events).toEqual([]);
    expect(effects.projection).toMatchObject({
      key_slot_id: null,
      parking_spot_id: null,
      session_state: "PARKING",
      session_version: 2,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    const trackers = await context.adminPool.query<{ ended_at: Date | null }>(
      `SELECT ended_at FROM task_tracking_sessions WHERE valet_session_id = $1`,
      [fixture.sessionId],
    );
    expect(trackers.rows[0]?.ended_at).toBeNull();
  });
});
