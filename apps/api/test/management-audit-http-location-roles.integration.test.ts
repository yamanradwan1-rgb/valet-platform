import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function organizationPath(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/audit-events`;
}

function locationPath(organizationId: string, locationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/audit-events`;
}

function eventIds(body: unknown): string[] {
  const items = (body as { items?: Array<{ eventId?: unknown }> } | undefined)
    ?.items;
  return (items ?? []).map((item) => String(item.eventId));
}

describe("MGT-BE-06 Management audit HTTP Location roles", () => {
  it("keeps Location Manager exact-grant history and rechecks grant revocation", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(
      organizationId,
      user.id,
      "LOCATION_MANAGER",
    );
    const granted = await fixture.addLocation(organizationId);
    const ungranted = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      granted.locationId,
    );
    const eventId = await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: granted.locationId,
      organizationId,
    });
    const auth = await fixture.nativeLogin(user);

    const organization = await fixture.managementGet(
      organizationPath(organizationId),
      auth.accessToken,
    );
    expect(organization.status).toBe(404);
    expect(organization.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const otherLocation = await fixture.managementGet(
      locationPath(organizationId, ungranted.locationId),
      auth.accessToken,
    );
    expect(otherLocation.status).toBe(404);
    expect(otherLocation.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const grantedRead = await fixture.managementGet(
      locationPath(organizationId, granted.locationId),
      auth.accessToken,
    );
    expect(grantedRead.status).toBe(200);
    expect(eventIds(grantedRead.body)).toEqual([eventId]);

    await fixture.query(`UPDATE locations SET status = 'INACTIVE' WHERE id = $1`, [
      granted.locationId,
    ]);
    const historicalRead = await fixture.managementGet(
      locationPath(organizationId, granted.locationId),
      auth.accessToken,
    );
    expect(historicalRead.status).toBe(200);
    expect(eventIds(historicalRead.body)).toEqual([eventId]);

    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE organization_id = $1 AND membership_id = $2 AND location_id = $3`,
      [organizationId, membershipId, granted.locationId],
    );
    const revoked = await fixture.managementGet(
      locationPath(organizationId, granted.locationId),
      auth.accessToken,
    );
    expect(revoked.status).toBe(404);
    expect(revoked.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("requires Supervisor exact active Shift and rechecks when it ends", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(
      organizationId,
      user.id,
      "VALET_SUPERVISOR",
    );
    const activeShiftLocation = await fixture.addLocation(organizationId);
    const otherLocation = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      activeShiftLocation.locationId,
    );
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      otherLocation.locationId,
    );
    const auth = await fixture.nativeLogin(user);
    const path = locationPath(organizationId, activeShiftLocation.locationId);

    const noShift = await fixture.managementGet(path, auth.accessToken);
    expect(noShift.status).toBe(404);
    expect(noShift.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const shiftId = await fixture.startActiveShift(
      organizationId,
      activeShiftLocation.locationId,
      membershipId,
    );
    expect((await fixture.managementGet(path, auth.accessToken)).status).toBe(200);

    const crossLocation = await fixture.managementGet(
      locationPath(organizationId, otherLocation.locationId),
      auth.accessToken,
    );
    expect(crossLocation.status).toBe(404);
    expect(crossLocation.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await fixture.endShift(shiftId);
    const ended = await fixture.managementGet(path, auth.accessToken);
    expect(ended.status).toBe(404);
    expect(ended.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies Employee Organization and Location audit explorer access", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(
      organizationId,
      user.id,
      "VALET_EMPLOYEE",
    );
    const location = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      location.locationId,
    );
    const auth = await fixture.nativeLogin(user);

    const organization = await fixture.managementGet(
      organizationPath(organizationId),
      auth.accessToken,
    );
    expect(organization.status).toBe(404);
    expect(organization.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const locationRead = await fixture.managementGet(
      locationPath(organizationId, location.locationId),
      auth.accessToken,
    );
    expect(locationRead.status).toBe(404);
    expect(locationRead.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
