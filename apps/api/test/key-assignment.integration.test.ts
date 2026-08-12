import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import {
  expectKeyError,
  KeyTestContext,
  type KeyFixture,
} from "./key-test-context";

const context = new KeyTestContext("assignment");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function request(
  fixture: KeyFixture,
  overrides: Partial<{
    authenticatedUserId: string;
    expectedVersion: number;
    keySlotCode: string;
    sessionId: string;
  }> = {},
) {
  return {
    authenticatedUserId: fixture.userId,
    expectedVersion: 1,
    keySlotCode: fixture.slotCode,
    sessionId: fixture.sessionId,
    ...overrides,
  };
}

describe("VAL-005C initial KeySlot assignment", () => {
  it("assigns once with one same-time custody fact and one safe audit", async () => {
    const fixture = await context.createKeyFixture();
    const result = await createAssignKeySlotCommandExecutor(
      context.runtimePool,
    )(request(fixture));

    expect(result).toEqual({
      keySlotCode: fixture.slotCode,
      sessionId: fixture.sessionId,
      state: "AWAITING_PARKING",
      version: 2,
    });
    expect(await context.session(fixture.sessionId)).toEqual({
      key_slot_id: fixture.slotId,
      state: "AWAITING_PARKING",
      version: 2,
    });
    const custody = await context.custodyEvents(fixture.sessionId);
    const audits = await context.keyAuditEvents(fixture.sessionId);
    expect(custody).toHaveLength(1);
    expect(custody[0]).toMatchObject({
      actor_membership_id: fixture.membershipId,
      event_type: "SLOT_ASSIGNED",
      key_slot_id: fixture.slotId,
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_membership_id: fixture.membershipId,
      entity_type: "VALET_SESSION",
      event_type: "VALET_SESSION_KEY_SLOT_ASSIGNED",
      metadata_json: {
        currentKeySlotId: fixture.slotId,
        fromVersion: 1,
        previousKeySlotId: null,
        toVersion: 2,
      },
    });
    expect(audits[0]?.occurred_at).toEqual(custody[0]?.occurred_at);
  });

  it("uses one trimmed exact code contract for scan and manual entry", async () => {
    const fixture = await context.createKeyFixture();
    const execute = createAssignKeySlotCommandExecutor(context.runtimePool);
    expect(
      await execute(
        request(fixture, { keySlotCode: `  ${fixture.slotCode}  ` }),
      ),
    ).toMatchObject({ keySlotCode: fixture.slotCode, version: 2 });

    const secondSession = await context.addSession(fixture);
    await expectKeyError(
      execute(
        request(fixture, {
          keySlotCode: fixture.slotCode.toLowerCase(),
          sessionId: secondSession,
        }),
      ),
      "KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE",
    );
  });

  it("conceals inactive, cross-Organization, wrong-Location, and occupied slots", async () => {
    const fixture = await context.createKeyFixture();
    const inactive = await context.addKeySlot(fixture, { status: "INACTIVE" });
    const foreign = await context.createKeyFixture();
    const secondLocationId = await context.addLocation(fixture);
    const wrongLocation = await context.addKeySlot({
      locationId: secondLocationId,
      organizationId: fixture.organizationId,
    });
    const occupied = await context.addKeySlot(fixture);
    await context.addSession(fixture, { keySlotId: occupied.id });
    const execute = createAssignKeySlotCommandExecutor(context.runtimePool);

    for (const code of [
      inactive.code,
      foreign.slotCode,
      wrongLocation.code,
      occupied.code,
    ]) {
      await expectKeyError(
        execute(request(fixture, { keySlotCode: code })),
        "KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE",
      );
    }
    expect(await context.session(fixture.sessionId)).toMatchObject({
      key_slot_id: null,
      version: 1,
    });
    expect(await context.custodyEvents(fixture.sessionId)).toHaveLength(0);
    expect(await context.keyAuditEvents(fixture.sessionId)).toHaveLength(0);
  });

  it("preserves version-before-state-before-slot error precedence", async () => {
    const fixture = await context.createKeyFixture({ sessionState: "PARKED" });
    const execute = createAssignKeySlotCommandExecutor(context.runtimePool);
    const missingCode = "does-not-exist";

    await expectKeyError(
      execute(
        request(fixture, { expectedVersion: 2, keySlotCode: missingCode }),
      ),
      "VERSION_CONFLICT",
    );
    await expectKeyError(
      execute(request(fixture, { keySlotCode: missingCode })),
      "INVALID_STATE_TRANSITION",
    );
  });

  it("treats current-version same-slot assignment as a no-op, never stale replay", async () => {
    const fixture = await context.createKeyFixture();
    const execute = createAssignKeySlotCommandExecutor(context.runtimePool);
    await execute(request(fixture));
    const retry = await execute(request(fixture, { expectedVersion: 2 }));

    expect(retry.version).toBe(2);
    expect(await context.custodyEvents(fixture.sessionId)).toHaveLength(1);
    expect(await context.keyAuditEvents(fixture.sessionId)).toHaveLength(1);
    await expectKeyError(execute(request(fixture)), "VERSION_CONFLICT");
  });
});
