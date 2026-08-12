import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import { createClearKeySlotCommandExecutor } from "../src/modules/keys/clear-key-slot-command";
import {
  recordKeyCheckedOut,
  recordKeyReturnedToSlot,
} from "../src/modules/keys/parking-key-custody";
import { KeyTestContext } from "./key-test-context";
import { expectKeyError } from "./key-test-context";

const context = new KeyTestContext("correction");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005C KeySlot corrections", () => {
  it("reassigns A to B with ordered immutable custody and one audit", async () => {
    const fixture = await context.createKeyFixture();
    const replacement = await context.addKeySlot(fixture);
    const assign = createAssignKeySlotCommandExecutor(context.runtimePool);
    await assign({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      keySlotCode: fixture.slotCode,
      sessionId: fixture.sessionId,
    });
    const originalEvent = (await context.custodyEvents(fixture.sessionId))[0];

    const result = await assign({
      authenticatedUserId: fixture.userId,
      expectedVersion: 2,
      keySlotCode: replacement.code,
      sessionId: fixture.sessionId,
    });
    expect(result).toMatchObject({ keySlotCode: replacement.code, version: 3 });
    const custody = await context.custodyEvents(fixture.sessionId);
    expect(
      custody.map(({ event_type, key_slot_id }) => [event_type, key_slot_id]),
    ).toEqual([
      ["SLOT_ASSIGNED", fixture.slotId],
      ["SLOT_CLEARED", fixture.slotId],
      ["SLOT_ASSIGNED", replacement.id],
    ]);
    expect(custody[0]).toEqual(originalEvent);
    expect(custody[1]?.occurred_at).toEqual(custody[2]?.occurred_at);
    const audits = await context.keyAuditEvents(fixture.sessionId);
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({
      event_type: "VALET_SESSION_KEY_SLOT_REASSIGNED",
      metadata_json: {
        currentKeySlotId: replacement.id,
        fromVersion: 2,
        previousKeySlotId: fixture.slotId,
        toVersion: 3,
      },
    });
  });

  it("clears a current slot once and treats current-version null as a no-op", async () => {
    const fixture = await context.createKeyFixture();
    const assign = createAssignKeySlotCommandExecutor(context.runtimePool);
    const clear = createClearKeySlotCommandExecutor(context.runtimePool);
    await assign({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      keySlotCode: fixture.slotCode,
      sessionId: fixture.sessionId,
    });

    const cleared = await clear({
      authenticatedUserId: fixture.userId,
      expectedVersion: 2,
      sessionId: fixture.sessionId,
    });
    expect(cleared).toEqual({
      keySlotCode: null,
      sessionId: fixture.sessionId,
      state: "AWAITING_PARKING",
      version: 3,
    });
    expect(await context.session(fixture.sessionId)).toMatchObject({
      key_slot_id: null,
      state: "AWAITING_PARKING",
      version: 3,
    });
    expect(
      (await context.custodyEvents(fixture.sessionId)).map(
        ({ event_type }) => event_type,
      ),
    ).toEqual(["SLOT_ASSIGNED", "SLOT_CLEARED"]);
    expect((await context.keyAuditEvents(fixture.sessionId))[1]).toMatchObject({
      event_type: "VALET_SESSION_KEY_SLOT_CLEARED",
    });

    expect(
      await clear({
        authenticatedUserId: fixture.userId,
        expectedVersion: 3,
        sessionId: fixture.sessionId,
      }),
    ).toEqual(cleared);
    expect(await context.custodyEvents(fixture.sessionId)).toHaveLength(2);
    expect(await context.keyAuditEvents(fixture.sessionId)).toHaveLength(2);
  });

  it("applies version-before-state precedence to clear", async () => {
    const fixture = await context.createKeyFixture({ sessionState: "PARKED" });
    const clear = createClearKeySlotCommandExecutor(context.runtimePool);
    await expectKeyError(
      clear({
        authenticatedUserId: fixture.userId,
        expectedVersion: 2,
        sessionId: fixture.sessionId,
      }),
      "VERSION_CONFLICT",
    );
    await expectKeyError(
      clear({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        sessionId: fixture.sessionId,
      }),
      "INVALID_STATE_TRANSITION",
    );
  });

  it("rolls assignment and custody back when audit insertion fails", async () => {
    const fixture = await context.createKeyFixture();
    const duplicateAuditId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, event_type, entity_type, entity_id,
          metadata_json, occurred_at)
       VALUES ($1, $2, $3, $4, $5, 'EXISTING', 'VALET_SESSION', $4,
               '{}'::jsonb, transaction_timestamp())`,
      [
        duplicateAuditId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
      ],
    );

    await expect(
      createAssignKeySlotCommandExecutor(context.runtimePool, {
        auditEventIdFactory: () => duplicateAuditId,
      })({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        keySlotCode: fixture.slotCode,
        sessionId: fixture.sessionId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await context.session(fixture.sessionId)).toMatchObject({
      key_slot_id: null,
      version: 1,
    });
    expect(await context.custodyEvents(fixture.sessionId)).toHaveLength(0);
    expect(await context.keyAuditEvents(fixture.sessionId)).toHaveLength(0);
  });

  it("rolls assignment back when custody insertion fails", async () => {
    const first = await context.createKeyFixture();
    const duplicateCustodyId = randomUUID();
    await createAssignKeySlotCommandExecutor(context.runtimePool, {
      custodyEventIdFactory: () => duplicateCustodyId,
    })({
      authenticatedUserId: first.userId,
      expectedVersion: 1,
      keySlotCode: first.slotCode,
      sessionId: first.sessionId,
    });
    const second = await context.createKeyFixture();

    await expect(
      createAssignKeySlotCommandExecutor(context.runtimePool, {
        custodyEventIdFactory: () => duplicateCustodyId,
      })({
        authenticatedUserId: second.userId,
        expectedVersion: 1,
        keySlotCode: second.slotCode,
        sessionId: second.sessionId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await context.session(second.sessionId)).toMatchObject({
      key_slot_id: null,
      version: 1,
    });
    expect(await context.custodyEvents(second.sessionId)).toHaveLength(0);
    expect(await context.keyAuditEvents(second.sessionId)).toHaveLength(0);
  });

  it("provides transaction-aware checked-out and returned-to-slot primitives", async () => {
    const fixture = await context.createKeyFixture();
    await createAssignKeySlotCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      keySlotCode: fixture.slotCode,
      sessionId: fixture.sessionId,
    });
    const scope = {
      actorMembershipId: fixture.membershipId,
      keySlotId: fixture.slotId,
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      sessionId: fixture.sessionId,
    };
    const transaction = await context.runtimePool.connect();
    await transaction.query("BEGIN");
    const time = (
      await transaction.query<{ value: Date }>(
        `SELECT transaction_timestamp()::timestamptz(3) AS value`,
      )
    ).rows[0]!.value;
    await recordKeyCheckedOut(transaction, { ...scope, occurredAt: time });
    await transaction.query("ROLLBACK");
    transaction.release();
    expect(await context.custodyEvents(fixture.sessionId)).toHaveLength(1);

    const committed = await context.runtimePool.connect();
    await committed.query("BEGIN");
    await recordKeyReturnedToSlot(committed, { ...scope, occurredAt: time });
    await committed.query("COMMIT");
    committed.release();
    expect(
      (await context.custodyEvents(fixture.sessionId)).map(
        ({ event_type }) => event_type,
      ),
    ).toEqual(["SLOT_ASSIGNED", "RETURNED_TO_SLOT"]);
  });

  it("rejects an internal custody primitive with mismatched actor scope", async () => {
    const fixture = await context.createKeyFixture();
    const foreign = await context.createKeyFixture();
    await createAssignKeySlotCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      keySlotCode: fixture.slotCode,
      sessionId: fixture.sessionId,
    });
    const transaction = await context.runtimePool.connect();
    await transaction.query("BEGIN");
    await expect(
      recordKeyCheckedOut(transaction, {
        actorMembershipId: foreign.membershipId,
        keySlotId: fixture.slotId,
        locationId: fixture.locationId,
        occurredAt: new Date(0),
        organizationId: fixture.organizationId,
        sessionId: fixture.sessionId,
      }),
    ).rejects.toThrow("Key custody scope is invalid.");
    await transaction.query("ROLLBACK");
    transaction.release();
    expect(await context.custodyEvents(fixture.sessionId)).toHaveLength(1);
  });
});
