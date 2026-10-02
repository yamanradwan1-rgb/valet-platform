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

async function denied(locationId: string, accessToken: string) {
  for (const path of Object.values(resourcePaths(locationId))) {
    const reply = await fixture.managementGet(path, accessToken);
    expect(reply.status).toBe(404);
    expect(reply.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(reply.body).not.toHaveProperty("items");
  }
}

describe("Issue #254 persisted resource read authority", () => {
  it("allows exact granted LM, conceals foreign Location/Organization and rechecks grants", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id, {
      role: "LOCATION_MANAGER",
    });
    const location = await fixture.addLocation(membership.organizationId);
    const other = await fixture.addLocation(membership.organizationId);
    const foreignOrganization = await fixture.createOrganization();
    const foreign = await fixture.addLocation(foreignOrganization);
    await fixture.grantLocationAccess(
      membership.organizationId,
      membership.membershipId,
      location.locationId,
    );
    await fixture.seedResources(membership.organizationId, location.locationId);
    await fixture.seedResources(
      membership.organizationId,
      other.locationId,
      "FOREIGNLOCATION",
    );
    await fixture.seedResources(
      foreignOrganization,
      foreign.locationId,
      "FOREIGNORG",
    );
    const auth = await fixture.nativeLogin(user);
    const paths = resourcePaths(location.locationId);
    const spots = await fixture.managementGet(paths.spots, auth.accessToken);
    const keys = await fixture.managementGet(paths.keys, auth.accessToken);
    expect(spots.status).toBe(200);
    expect(keys.status).toBe(200);
    expect(
      parkingSpotListResponseSchema.parse(spots.body).items[1]?.occupancy
        ?.vehicle.plateNumberNormalized,
    ).toBe("12345");
    expect(
      keySlotOverviewResponseSchema.parse(keys.body).items[1]?.holdingVehicle
        ?.plateNumberNormalized,
    ).toBe("12345");
    await denied(other.locationId, auth.accessToken);
    await denied(foreign.locationId, auth.accessToken);
    const inactive = await fixture.addLocation(membership.organizationId, {
      status: "INACTIVE",
    });
    await fixture.grantLocationAccess(
      membership.organizationId,
      membership.membershipId,
      inactive.locationId,
    );
    await denied(inactive.locationId, auth.accessToken);
    await fixture.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2`,
      [membership.membershipId, location.locationId],
    );
    await denied(location.locationId, auth.accessToken);
    await fixture.grantLocationAccess(
      membership.organizationId,
      membership.membershipId,
      location.locationId,
    );
    await fixture.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [membership.membershipId],
    );
    await denied(location.locationId, auth.accessToken);
  });

  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "denies %s even with exact access",
    async (role) => {
      const user = await fixture.createUser();
      const membership = await fixture.createMembership(user.id, { role });
      const location = await fixture.addLocation(membership.organizationId);
      await fixture.grantLocationAccess(
        membership.organizationId,
        membership.membershipId,
        location.locationId,
      );
      await fixture.seedResources(
        membership.organizationId,
        location.locationId,
      );
      const auth = await fixture.nativeLogin(user);
      await denied(location.locationId, auth.accessToken);
    },
  );

  it("rechecks CA entitlement and conceals another tenant's populated resources", async () => {
    const admin = await fixture.admin();
    const location = await fixture.addLocation(admin.organizationId);
    await fixture.seedResources(admin.organizationId, location.locationId);
    const otherAdmin = await fixture.admin();
    await denied(location.locationId, otherAdmin.auth.accessToken);
    for (const path of Object.values(resourcePaths(location.locationId))) {
      expect(
        (await fixture.managementGet(path, admin.auth.accessToken)).status,
      ).toBe(200);
    }
    await fixture.query(
      `UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1`,
      [admin.organizationId],
    );
    await denied(location.locationId, admin.auth.accessToken);
  });
});
