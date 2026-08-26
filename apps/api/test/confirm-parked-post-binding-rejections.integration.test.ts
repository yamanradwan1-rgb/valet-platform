import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConfirmParkedTestContext,
  expectConfirmError,
} from "./confirm-parked-test-context";
import type { ConfirmParkedFixture } from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("postbindingreject");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

type PostBindingFixture = Awaited<
  ReturnType<typeof context.createPostBindingFixture>
>;

async function postBindingEffects(fixture: ConfirmParkedFixture) {
  const effects = await context.completionEffects(fixture);
  const counts = await context.adminPool.query<{
    assigned_audits: number;
    slot_assigned: number;
  }>(
    `SELECT
       (SELECT count(*)::integer FROM key_custody_events
        WHERE valet_session_id = $1 AND event_type = 'SLOT_ASSIGNED')
         AS slot_assigned,
       (SELECT count(*)::integer FROM audit_events
        WHERE valet_session_id = $1
          AND event_type = 'VALET_SESSION_KEY_SLOT_ASSIGNED')
         AS assigned_audits`,
    [fixture.sessionId],
  );
  return { ...effects, ...counts.rows[0]! };
}

async function expectUntouchedEffects(fixture: PostBindingFixture) {
  const effects = await postBindingEffects(fixture);
  expect(effects.events).toEqual([]);
  expect(effects.slot_assigned).toBe(0);
  expect(effects.assigned_audits).toBe(0);
  expect(effects.projection).toMatchObject({
    key_slot_id: null,
    parked_at: null,
    parking_spot_id: null,
    session_state: "PARKING",
    session_version: 2,
    task_status: "IN_PROGRESS",
    task_version: 4,
  });
}

async function insertForeignSlot(
  fixture: ConfirmParkedFixture,
  organizationId: string,
  locationId: string,
) {
  const slot = { code: `Foreign-${randomUUID()}`, id: randomUUID() };
  await context.adminPool.query(
    `INSERT INTO key_slots
       (id, organization_id, location_id, code, status, updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
    [slot.id, organizationId, locationId, slot.code],
  );
  return slot.code;
}

describe("DEC-068 binding rejections with zero side effects", () => {
  it("rejects an unknown code", async () => {
    const fixture = await context.createPostBindingFixture();
    await expectConfirmError(
      context.confirm(fixture, {
        keySlotCode: randomUUID(),
        sessionVersion: 2,
        taskVersion: 4,
      }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(fixture);
  });

  it("rejects an inactive chosen slot", async () => {
    const fixture = await context.createPostBindingFixture();
    await context.adminPool.query(
      `UPDATE key_slots SET status = 'INACTIVE' WHERE id = $1`,
      [fixture.keySlotId],
    );
    await expectConfirmError(
      context.confirm(fixture, { sessionVersion: 2, taskVersion: 4 }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(fixture);
  });

  it("rejects a slot already occupied by another session", async () => {
    const fixture = await context.createPostBindingFixture();
    const occupantId = await context.addSession(fixture, "PARKED");
    await context.adminPool.query(
      `UPDATE valet_sessions SET key_slot_id = $2 WHERE id = $1`,
      [occupantId, fixture.keySlotId],
    );
    await expectConfirmError(
      context.confirm(fixture, { sessionVersion: 2, taskVersion: 4 }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(fixture);
    const occupant = await context.adminPool.query<{ key_slot_id: string }>(
      `SELECT key_slot_id::text FROM valet_sessions WHERE id = $1`,
      [occupantId],
    );
    expect(occupant.rows[0]?.key_slot_id).toBe(fixture.keySlotId);
  });

  it("conceals a code that exists only in another Location", async () => {
    const fixture = await context.createPostBindingFixture();
    const otherLocationId = await context.addLocation(fixture);
    const foreignCode = await insertForeignSlot(
      fixture,
      fixture.organizationId,
      otherLocationId,
    );
    await expectConfirmError(
      context.confirm(fixture, {
        keySlotCode: foreignCode,
        sessionVersion: 2,
        taskVersion: 4,
      }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(fixture);
  });

  it("conceals a same-code slot owned by another Organization", async () => {
    const target = await context.createPostBindingFixture();
    const foreign = await context.createFixture();
    const foreignCode = await insertForeignSlot(
      target,
      foreign.organizationId,
      foreign.locationId,
    );
    await expectConfirmError(
      context.confirm(target, {
        keySlotCode: foreignCode,
        sessionVersion: 2,
        taskVersion: 4,
      }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(target);
  });
});
