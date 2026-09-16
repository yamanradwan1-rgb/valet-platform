import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createConfirmParkedCommandExecutor } from "../src/modules/parking/confirm-parked-command";
import {
  ConfirmParkedTestContext,
  expectConfirmError,
  type ConfirmParkedFixture,
} from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("be05_spot_policy");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function zoneCode(fixture: ConfirmParkedFixture): Promise<string> {
  const result = await context.adminPool.query<{ code: string }>(
    "SELECT code FROM parking_zones WHERE id = $1",
    [fixture.parkingZoneId],
  );
  return result.rows[0]!.code;
}

function confirmZone(fixture: ConfirmParkedFixture, parkingZoneCode: string) {
  return createConfirmParkedCommandExecutor(context.runtimePool)({
    authenticatedUserId: fixture.userId,
    expectedSessionVersion: 3,
    expectedTaskVersion: 4,
    keySlotCode: fixture.keySlotCode,
    parkingZoneCode,
    sessionId: fixture.sessionId,
  });
}

async function waitForLockWait(queryFragment: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const result = await context.adminPool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database()
           AND wait_event_type = 'Lock'
           AND query ILIKE $1
       ) AS waiting`,
      [`%${queryFragment}%`],
    );
    if (result.rows[0]?.waiting === true) return;
  }
  throw new Error(`Expected a lock wait for ${queryFragment}.`);
}

async function organizationToken(organizationId: string): Promise<Date> {
  const result = await context.adminPool.query<{ updated_at: Date }>(
    "SELECT updated_at FROM organizations WHERE id = $1",
    [organizationId],
  );
  return result.rows[0]!.updated_at;
}

describe("MGT-BE-05 Parking Spot required policy", () => {
  it("uses current Company/Location effective policy for zone-only completion", async () => {
    const optional = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      "UPDATE organizations SET parking_spot_required = false WHERE id = $1",
      [optional.organizationId],
    );
    const optionalResult = await confirmZone(optional, await zoneCode(optional));
    expect(optionalResult).toMatchObject({
      parkingSpotCode: null,
      parkingSpotId: null,
      parkingZoneId: optional.parkingZoneId,
      state: "PARKED",
    });

    const inheritedRequired = await context.createConfirmParkedFixture();
    await expectConfirmError(
      confirmZone(inheritedRequired, await zoneCode(inheritedRequired)),
      "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
    );

    const locationOptional = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE locations
       SET parking_spot_required_override = false
       WHERE id = $1`,
      [locationOptional.locationId],
    );
    await expect(
      confirmZone(locationOptional, await zoneCode(locationOptional)),
    ).resolves.toMatchObject({ parkingSpotId: null, state: "PARKED" });

    const locationRequired = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      "UPDATE organizations SET parking_spot_required = false WHERE id = $1",
      [locationRequired.organizationId],
    );
    await context.adminPool.query(
      `UPDATE locations
       SET parking_spot_required_override = true
       WHERE id = $1`,
      [locationRequired.locationId],
    );
    await expectConfirmError(
      confirmZone(locationRequired, await zoneCode(locationRequired)),
      "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
    );
  });

  it("lets a committed Management policy change win before zone-only completion", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      "UPDATE organizations SET parking_spot_required = false WHERE id = $1",
      [fixture.organizationId],
    );
    const admin = await context.addMember(fixture, "ORG_ADMIN", false);
    const writer = await context.runtimePool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query(
        `SELECT * FROM management_settings_set_company_scalar(
           $1, $2, 'parkingSpotRequired', 'true', $3::timestamptz
         )`,
        [
          admin.membershipId,
          fixture.organizationId,
          await organizationToken(fixture.organizationId),
        ],
      );
      const completion = confirmZone(fixture, await zoneCode(fixture));
      await waitForLockWait("pg_advisory_xact_lock_shared");
      await writer.query("COMMIT");
      await expectConfirmError(
        completion,
        "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
      );
    } finally {
      try {
        await writer.query("ROLLBACK");
      } finally {
        writer.release();
      }
    }
  });

  it("lets a completion already past the policy boundary finish before a later change", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      "UPDATE organizations SET parking_spot_required = false WHERE id = $1",
      [fixture.organizationId],
    );
    const admin = await context.addMember(fixture, "ORG_ADMIN", false);
    const blocker = await context.adminPool.connect();
    const writer = await context.runtimePool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT id FROM key_slots WHERE id = $1 FOR UPDATE",
        [fixture.keySlotId],
      );
      const completion = confirmZone(fixture, await zoneCode(fixture));
      await waitForLockWait("FROM key_slots");

      await writer.query("BEGIN");
      const mutation = writer.query(
        `SELECT * FROM management_settings_set_company_scalar(
           $1, $2, 'parkingSpotRequired', 'true', $3::timestamptz
         )`,
        [
          admin.membershipId,
          fixture.organizationId,
          await organizationToken(fixture.organizationId),
        ],
      );
      await waitForLockWait("management_settings_set_company_scalar");
      await blocker.query("COMMIT");
      await expect(completion).resolves.toMatchObject({
        parkingSpotId: null,
        state: "PARKED",
      });
      await mutation;
      await writer.query("COMMIT");
      const policy = await context.adminPool.query<{ required: boolean }>(
        "SELECT parking_spot_required AS required FROM organizations WHERE id = $1",
        [fixture.organizationId],
      );
      expect(policy.rows[0]?.required).toBe(true);
    } finally {
      try {
        await blocker.query("ROLLBACK");
        await writer.query("ROLLBACK");
      } finally {
        blocker.release();
        writer.release();
      }
    }
  });
});
