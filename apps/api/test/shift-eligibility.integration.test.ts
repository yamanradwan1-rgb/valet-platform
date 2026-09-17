import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createActiveShiftQuery } from "../src/modules/shifts/active-shift-query";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { lockShiftOperationalEligibility } from "../src/modules/shifts/shift-operational-eligibility";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { expectShiftError, ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("eligibility");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function start(fixture: { locationId: string; userId: string }) {
  return createStartShiftCommandExecutor(context.runtimePool)({
    authenticatedUserId: fixture.userId,
    targetLocationId: fixture.locationId,
  });
}

async function eligibility(membershipId: string, locationId: string) {
  const transaction = await context.runtimePool.connect();
  try {
    await transaction.query("BEGIN");
    return await lockShiftOperationalEligibility(transaction, {
      locationId,
      membershipId,
    });
  } finally {
    await transaction.query("ROLLBACK");
    transaction.release();
  }
}

describe("VAL-005B active lookup and operational eligibility", () => {
  it("returns only the caller's own Location-scoped active Shift", async () => {
    const owner = await context.createFixture();
    const other = await context.createFixture();
    const active = await start(owner);
    const query = createActiveShiftQuery(context.runtimePool);

    expect(
      await query({
        authenticatedUserId: owner.userId,
        locationId: owner.locationId,
      }),
    ).toEqual(active);
    expect(
      await query({
        authenticatedUserId: owner.userId,
        locationId: other.locationId,
      }),
    ).toBeNull();
    expect(
      await query({
        authenticatedUserId: other.userId,
        locationId: owner.locationId,
      }),
    ).toBeNull();
  });

  it("keeps own stale active Shift discoverable after access and membership revocation", async () => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    await context.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
      [fixture.membershipId],
    );
    await context.adminPool.query(
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
      [fixture.membershipId],
    );

    const result = await createActiveShiftQuery(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(result).toEqual(active);
  });

  it("denies active lookup for a disabled User", async () => {
    const fixture = await context.createFixture();
    await start(fixture);
    await context.adminPool.query(
      `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
      [fixture.userId],
    );

    await expectShiftError(
      createActiveShiftQuery(context.runtimePool)({
        authenticatedUserId: fixture.userId,
        locationId: fixture.locationId,
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it.each([
    [
      "User disable",
      `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
      "userId",
    ],
    [
      "membership inactive",
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
      "membershipId",
    ],
    [
      "Organization inactive",
      `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`,
      "organizationId",
    ],
    [
      "Location inactive",
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1`,
      "locationId",
    ],
    [
      "access removal",
      `DELETE FROM membership_location_access WHERE membership_id = $1`,
      "membershipId",
    ],
    [
      "role change",
      `UPDATE organization_memberships SET role = 'ORG_ADMIN' WHERE id = $1`,
      "membershipId",
    ],
  ] as const)("becomes false after committed %s", async (_name, sql, key) => {
    const fixture = await context.createFixture();
    await start(fixture);
    await context.adminPool.query(sql, [fixture[key]]);
    expect(
      await eligibility(fixture.membershipId, fixture.locationId),
    ).toBeNull();
  });

  it("becomes false after Shift end", async () => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    await createEndShiftCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      cashReported: "0",
      shiftId: active.shiftId,
    });
    expect(
      await eligibility(fixture.membershipId, fixture.locationId),
    ).toBeNull();
  });

  it("is false when the active Shift belongs to another Location", async () => {
    const fixture = await context.createFixture();
    const secondLocationId = await context.addLocation(fixture);
    await start(fixture);
    expect(
      await eligibility(fixture.membershipId, secondLocationId),
    ).toBeNull();
  });

  it("holds Shift end behind the caller's eligibility transaction", async () => {
    const fixture = await context.createFixture();
    const active = await start(fixture);
    const transaction = await context.runtimePool.connect();
    await transaction.query("BEGIN");
    expect(
      await lockShiftOperationalEligibility(transaction, {
        locationId: fixture.locationId,
        membershipId: fixture.membershipId,
      }),
    ).toEqual({ shiftId: active.shiftId });

    let settled = false;
    const end = createEndShiftCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      cashReported: "0",
      shiftId: active.shiftId,
    }).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(settled).toBe(false);
    await transaction.query("COMMIT");
    transaction.release();
    await end;
  });

  it("holds access revocation behind the caller's eligibility transaction", async () => {
    const fixture = await context.createFixture();
    await start(fixture);
    const transaction = await context.runtimePool.connect();
    await transaction.query("BEGIN");
    expect(
      await lockShiftOperationalEligibility(transaction, {
        locationId: fixture.locationId,
        membershipId: fixture.membershipId,
      }),
    ).not.toBeNull();

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
    expect(
      await eligibility(fixture.membershipId, fixture.locationId),
    ).toBeNull();
  });
});
