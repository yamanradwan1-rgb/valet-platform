import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConfirmParkedTestContext,
  expectConfirmError,
} from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("keyreturn");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function expectUntouchedEffects(fixture: Awaited<
  ReturnType<typeof context.createConfirmParkedFixture>
>) {
  const effects = await context.completionEffects(fixture);
  expect(effects.events).toEqual([]);
  expect(effects.projection).toMatchObject({
    key_slot_id: fixture.keySlotId,
    parking_spot_id: null,
    session_state: "PARKING",
    session_version: 3,
    task_status: "IN_PROGRESS",
    task_version: 4,
  });
}

describe("DEC-065 verified Key Slot return", () => {
  it("accepts the assigned slot code with surrounding trim only", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.confirm(fixture, {
      keySlotCode: `  ${fixture.keySlotCode}  `,
    });
    const custody = await context.adminPool.query(
      `SELECT key_slot_id::text FROM key_custody_events
       WHERE valet_session_id = $1 AND event_type = 'RETURNED_TO_SLOT'`,
      [fixture.sessionId],
    );
    expect(custody.rows).toEqual([{ key_slot_id: fixture.keySlotId }]);
  });

  it("rejects a different ACTIVE same-scope slot without side effects", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const otherSlot = await context.addKeySlot(fixture);
    await expectConfirmError(
      context.confirm(fixture, { keySlotCode: otherSlot.code }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(fixture);
  });

  it("rejects unknown codes without leaking protected detail", async () => {
    const fixture = await context.createConfirmParkedFixture();
    for (const keySlotCode of [
      randomUUID(),
      `${fixture.keySlotCode}-extra`,
      fixture.keySlotCode.slice(0, -1),
      fixture.keySlotCode.toLowerCase(),
    ]) {
      await expectConfirmError(
        context.confirm(fixture, { keySlotCode }),
        "KEY_CUSTODY_NOT_READY",
      );
    }
    await expectUntouchedEffects(fixture);
  });

  it("rejects an inactive assigned slot without side effects", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE key_slots SET status = 'INACTIVE' WHERE id = $1`,
      [fixture.keySlotId],
    );
    await expectConfirmError(
      context.confirm(fixture),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(fixture);
  });

  it("rejects a code that exists only in another Location of the Organization", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const otherLocationId = await context.addLocation(fixture);
    const foreignLocationSlot = { code: `Other-${randomUUID()}`, id: randomUUID() };
    await context.adminPool.query(
      `INSERT INTO key_slots
         (id, organization_id, location_id, code, status, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [
        foreignLocationSlot.id,
        fixture.organizationId,
        otherLocationId,
        foreignLocationSlot.code,
      ],
    );
    await expectConfirmError(
      context.confirm(fixture, { keySlotCode: foreignLocationSlot.code }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(fixture);
  });

  it("conceals a same-code slot owned by another Organization", async () => {
    const target = await context.createConfirmParkedFixture();
    const foreign = await context.createConfirmParkedFixture();
    await expectConfirmError(
      context.confirm(target, { keySlotCode: foreign.keySlotCode }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectConfirmError(
      context.confirm(foreign, { keySlotCode: target.keySlotCode }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectUntouchedEffects(target);
    await expectUntouchedEffects(foreign);
  });

  it("rejects a missing current assignment even with a valid scan", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions SET key_slot_id = NULL WHERE id = $1`,
      [fixture.sessionId],
    );
    await expectConfirmError(
      context.confirm(fixture),
      "KEY_CUSTODY_NOT_READY",
    );
    const effects = await context.completionEffects(fixture);
    expect(effects.events).toEqual([]);
  });

  it("keeps exactly one RETURNED_TO_SLOT bound to the persisted assignment on success", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.confirm(fixture);
    const effects = await context.completionEffects(fixture);
    expect(effects.projection).toMatchObject({
      key_slot_id: fixture.keySlotId,
      session_state: "PARKED",
      task_status: "COMPLETED",
    });
    expect(
      effects.events.filter((event) => event.event_type === "RETURNED_TO_SLOT"),
    ).toHaveLength(1);
  });
});
