import {
  keySlotOverviewResponseSchema,
  parkingSpotListResponseSchema,
} from "@valet/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ResourceOccupancyTestFixture,
  resourcePaths,
} from "./resource-occupancy-test-fixture";

const fixture = new ResourceOccupancyTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("Issue #254 PostgreSQL resource projections", () => {
  it("returns exact CA vehicle facts, deterministic pages, and current movement/release", async () => {
    const admin = await fixture.admin();
    const location = await fixture.addLocation(admin.organizationId);
    const other = await fixture.addLocation(admin.organizationId);
    const seeded = await fixture.seedResources(
      admin.organizationId,
      location.locationId,
      "12-345",
    );
    await fixture.seedResources(
      admin.organizationId,
      other.locationId,
      "998877",
    );
    const paths = resourcePaths(location.locationId);
    const spotsReply = await fixture.managementGet(
      paths.spots,
      admin.auth.accessToken,
    );
    expect(spotsReply.status).toBe(200);
    expect(spotsReply.headers.get("cache-control")).toContain("no-store");
    const spots = parkingSpotListResponseSchema.parse(spotsReply.body);
    expect(spots.items.map((item) => item.code)).toEqual(["P-0", "P-1", "P-2"]);
    expect(spots.items[0]?.occupancy).toBeNull();
    expect(spots.items[1]?.occupancy).toEqual({
      sessionId: seeded.entries[1]!.sessionId,
      sessionState: "PARKED",
      vehicle: { plateNumberNormalized: "12345", temporaryDescriptor: null },
    });
    expect(spots.items[2]?.occupancy?.vehicle).toEqual({
      plateNumberNormalized: null,
      temporaryDescriptor: "سيارة زرقاء",
    });
    expect(JSON.stringify(spots)).not.toContain("998877");

    const keyReply = await fixture.managementGet(
      paths.keys,
      admin.auth.accessToken,
    );
    expect(keyReply.status).toBe(200);
    const keys = keySlotOverviewResponseSchema.parse(keyReply.body);
    expect(keys.items[0]).toMatchObject({
      holdingSessionId: null,
      holdingVehicle: null,
    });
    expect(keys.items[1]).toMatchObject({
      holdingSessionId: seeded.entries[1]!.sessionId,
      holdingVehicle: {
        plateNumberNormalized: "12345",
        temporaryDescriptor: null,
      },
    });
    expect(keys.items[2]?.holdingVehicle).toEqual({
      plateNumberNormalized: null,
      temporaryDescriptor: "سيارة زرقاء",
    });
    expect(JSON.stringify(keys)).not.toContain("998877");

    for (const path of [paths.spots, paths.keys]) {
      const first = await fixture.managementGet(
        `${path}?limit=1`,
        admin.auth.accessToken,
      );
      expect(first.status).toBe(200);
      expect(first.body?.items).toHaveLength(1);
      expect(first.body?.nextCursor).toEqual(expect.any(String));
      const cursor = encodeURIComponent(String(first.body?.nextCursor));
      const second = await fixture.managementGet(
        `${path}?limit=1&cursor=${cursor}`,
        admin.auth.accessToken,
      );
      expect(second.status).toBe(200);
      expect((second.body?.items as { code: string }[])[0]?.code).toBe(
        path === paths.spots ? "P-1" : "K-1",
      );
    }

    await fixture.query(
      `UPDATE valet_sessions SET parking_spot_id=$2 WHERE id=$1`,
      [seeded.entries[1]!.sessionId, seeded.entries[0]!.spotId],
    );
    const moved = parkingSpotListResponseSchema.parse(
      (await fixture.managementGet(paths.spots, admin.auth.accessToken)).body,
    );
    expect(moved.items[0]?.occupancy?.sessionId).toBe(
      seeded.entries[1]!.sessionId,
    );
    expect(moved.items[1]?.occupancy).toBeNull();
    await fixture.query(
      `UPDATE valet_sessions SET state='COMPLETED',completed_at=clock_timestamp(),
      key_slot_id=NULL,parking_spot_id=NULL,parking_zone_id=NULL WHERE id=$1`,
      [seeded.entries[1]!.sessionId],
    );
    const releasedSpots = parkingSpotListResponseSchema.parse(
      (await fixture.managementGet(paths.spots, admin.auth.accessToken)).body,
    );
    const releasedKeys = keySlotOverviewResponseSchema.parse(
      (await fixture.managementGet(paths.keys, admin.auth.accessToken)).body,
    );
    expect(releasedSpots.items[0]?.occupancy).toBeNull();
    expect(releasedKeys.items[1]).toMatchObject({
      holdingSessionId: null,
      holdingVehicle: null,
    });
  });

  it("uses non-COMPLETED associations defensively even if legacy terminal bindings remain", async () => {
    const admin = await fixture.admin();
    const location = await fixture.addLocation(admin.organizationId);
    const seeded = await fixture.seedResources(
      admin.organizationId,
      location.locationId,
    );
    // Deliberate defensive fixture: terminal bindings should normally be cleared by release.
    await fixture.query(
      `UPDATE valet_sessions SET state='COMPLETED',completed_at=clock_timestamp() WHERE id=$1`,
      [seeded.entries[1]!.sessionId],
    );
    const paths = resourcePaths(location.locationId);
    const spots = parkingSpotListResponseSchema.parse(
      (await fixture.managementGet(paths.spots, admin.auth.accessToken)).body,
    );
    const keys = keySlotOverviewResponseSchema.parse(
      (await fixture.managementGet(paths.keys, admin.auth.accessToken)).body,
    );
    expect(spots.items[1]?.occupancy).toBeNull();
    expect(keys.items[1]).toMatchObject({
      holdingSessionId: null,
      holdingVehicle: null,
    });
  });

  it("preserves inactive CA configuration without projecting live occupancy", async () => {
    const admin = await fixture.admin();
    const location = await fixture.addLocation(admin.organizationId);
    await fixture.seedResources(admin.organizationId, location.locationId);
    await fixture.query(
      `UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1`,
      [location.locationId],
    );
    const paths = resourcePaths(location.locationId);
    const reply = await fixture.managementGet(
      paths.spots,
      admin.auth.accessToken,
    );
    expect(reply.status).toBe(200);
    const spots = parkingSpotListResponseSchema.parse(reply.body);
    expect(spots.items).toHaveLength(3);
    for (const spot of spots.items)
      expect(spot).not.toHaveProperty("occupancy");
    const key = await fixture.managementGet(paths.keys, admin.auth.accessToken);
    expect(key.status).toBe(404);
  });
});
