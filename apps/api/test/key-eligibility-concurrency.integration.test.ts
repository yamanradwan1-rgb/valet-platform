import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import { lockAuthorizedKeySession } from "../src/modules/keys/key-session-authorization";
import { expectKeyError, KeyTestContext } from "./key-test-context";

const context = new KeyTestContext("eligibility");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-005C authorization and concurrency", () => {
  it("allows at most one winner when two sessions race for one slot", async () => {
    const fixture = await context.createKeyFixture();
    const secondSessionId = await context.addSession(fixture);
    const execute = createAssignKeySlotCommandExecutor(context.runtimePool);
    const settled = await Promise.allSettled([
      execute({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        keySlotCode: fixture.slotCode,
        sessionId: fixture.sessionId,
      }),
      execute({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        keySlotCode: fixture.slotCode,
        sessionId: secondSessionId,
      }),
    ]);

    expect(
      settled.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = settled.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE",
    });
    const occupancy = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM valet_sessions WHERE key_slot_id = $1`,
      [fixture.slotId],
    );
    expect(occupancy.rows[0]?.count).toBe("1");
    const custody = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM key_custody_events WHERE key_slot_id = $1`,
      [fixture.slotId],
    );
    expect(custody.rows[0]?.count).toBe("1");
  });

  it("does not treat possession of a session UUID or slot code as authority", async () => {
    const target = await context.createKeyFixture();
    const intruder = await context.createKeyFixture();

    await expectKeyError(
      createAssignKeySlotCommandExecutor(context.runtimePool)({
        authenticatedUserId: intruder.userId,
        expectedVersion: 1,
        keySlotCode: target.slotCode,
        sessionId: target.sessionId,
      }),
      "TENANT_ACCESS_DENIED",
    );
    expect(await context.session(target.sessionId)).toMatchObject({
      key_slot_id: null,
      state: "AWAITING_PARKING",
      version: 1,
    });
    expect(await context.custodyEvents(target.sessionId)).toHaveLength(0);
    expect(await context.keyAuditEvents(target.sessionId)).toHaveLength(0);
  });

  it.each([
    [
      "disabled User",
      `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
      "userId",
    ],
    [
      "inactive membership",
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
      "membershipId",
    ],
    [
      "inactive Organization",
      `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`,
      "organizationId",
    ],
    [
      "inactive Location",
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1`,
      "locationId",
    ],
    [
      "removed Location access",
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
      "membershipId",
    ],
    [
      "disallowed role",
      `UPDATE organization_memberships SET role = 'ORG_ADMIN' WHERE id = $1`,
      "membershipId",
    ],
    [
      "ended Shift",
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      "membershipId",
    ],
  ] as const)("denies mutation after committed %s", async (_name, sql, key) => {
    const fixture = await context.createKeyFixture();
    await context.adminPool.query(sql, [fixture[key]]);

    await expectKeyError(
      createAssignKeySlotCommandExecutor(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        keySlotCode: fixture.slotCode,
        sessionId: fixture.sessionId,
      }),
      "AUTHORIZATION_DENIED",
    );
    expect(await context.session(fixture.sessionId)).toMatchObject({
      key_slot_id: null,
      state: "AWAITING_PARKING",
      version: 1,
    });
  });

  it("holds eligibility facts locked through the caller transaction", async () => {
    const fixture = await context.createKeyFixture();
    const transaction = await context.runtimePool.connect();
    await transaction.query("BEGIN");
    await lockAuthorizedKeySession(transaction, {
      authenticatedUserId: fixture.userId,
      sessionId: fixture.sessionId,
    });

    let settled = false;
    const removal = context.adminPool
      .query(
        `DELETE FROM membership_location_access WHERE membership_id = $1`,
        [fixture.membershipId],
      )
      .finally(() => {
        settled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(settled).toBe(false);
    await transaction.query("COMMIT");
    transaction.release();
    await removal;
  });

  it("cannot use stale pre-lock authority after access revocation commits", async () => {
    const fixture = await context.createKeyFixture();
    const blocker = await context.adminPool.connect();
    await blocker.query("BEGIN");
    await blocker.query(
      `SELECT id FROM valet_sessions WHERE id = $1 FOR UPDATE`,
      [fixture.sessionId],
    );
    const assignment = createAssignKeySlotCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      keySlotCode: fixture.slotCode,
      sessionId: fixture.sessionId,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await context.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
      [fixture.membershipId],
    );
    await blocker.query("COMMIT");
    blocker.release();

    await expectKeyError(assignment, "AUTHORIZATION_DENIED");
    expect(await context.session(fixture.sessionId)).toMatchObject({
      key_slot_id: null,
      state: "AWAITING_PARKING",
      version: 1,
    });
    expect(await context.custodyEvents(fixture.sessionId)).toHaveLength(0);
    expect(await context.keyAuditEvents(fixture.sessionId)).toHaveLength(0);
  });
});
