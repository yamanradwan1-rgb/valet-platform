import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function staffPath(organizationId: string, membershipId?: string): string {
  return `/v1/staff/management/organizations/${organizationId}/staff${
    membershipId === undefined ? "" : `/${membershipId}`
  }`;
}

async function addGrant(
  organizationId: string,
  membershipId: string,
  locationId: string,
) {
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [organizationId, membershipId, locationId],
  );
}

async function createLm() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    role: "LOCATION_MANAGER",
  });
  const locationA = await fixture.addLocation(membership.organizationId, {
    name: "Alpha",
  });
  const locationB = await fixture.addLocation(membership.organizationId, {
    name: "Beta",
  });
  const locationC = await fixture.addLocation(membership.organizationId, {
    name: "Hidden",
  });
  await addGrant(
    membership.organizationId,
    membership.membershipId,
    locationA.locationId,
  );
  await addGrant(
    membership.organizationId,
    membership.membershipId,
    locationB.locationId,
  );
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, locationA, locationB, locationC, membership };
}

async function addTarget(
  organizationId: string,
  role:
    "ORG_ADMIN" | "LOCATION_MANAGER" | "VALET_EMPLOYEE" | "VALET_SUPERVISOR",
  locationIds: readonly string[],
) {
  const user = await fixture.createUser();
  const membershipId = await fixture.addMembership(
    organizationId,
    user.id,
    role,
  );
  for (const locationId of locationIds)
    await addGrant(organizationId, membershipId, locationId);
  return { membershipId };
}

async function expectHidden(response: {
  readonly status: number;
  readonly body: unknown;
}) {
  expect(response.status).toBe(404);
  expect(response.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
}

describe("T05-B Location Manager directory authority", () => {
  it("filters complete persisted coverage before LIMIT and conceals all forbidden targets", async () => {
    const actor = await createLm();
    const org = actor.membership.organizationId;
    const employee = await addTarget(org, "VALET_EMPLOYEE", [
      actor.locationA.locationId,
    ]);
    const supervisor = await addTarget(org, "VALET_SUPERVISOR", [
      actor.locationA.locationId,
      actor.locationB.locationId,
    ]);
    const mixed = await addTarget(org, "VALET_EMPLOYEE", [
      actor.locationA.locationId,
      actor.locationC.locationId,
    ]);
    const outside = await addTarget(org, "VALET_EMPLOYEE", [
      actor.locationC.locationId,
    ]);
    const zero = await addTarget(org, "VALET_EMPLOYEE", []);
    const elevatedAdmin = await addTarget(org, "ORG_ADMIN", [
      actor.locationA.locationId,
    ]);
    const elevatedManager = await addTarget(org, "LOCATION_MANAGER", [
      actor.locationA.locationId,
    ]);

    const list = await fixture.managementGet(
      `${staffPath(org)}?limit=100`,
      actor.auth.accessToken,
    );
    expect(list.status).toBe(200);
    const items = (list.body as { items: Array<{ membershipId: string }> })
      .items;
    expect(items.map((item) => item.membershipId).sort()).toEqual(
      [employee.membershipId, supervisor.membershipId].sort(),
    );
    const filtered = await fixture.managementGet(
      `${staffPath(org)}?limit=1&locationId=${actor.locationA.locationId}`,
      actor.auth.accessToken,
    );
    expect(filtered.status).toBe(200);
    expect((filtered.body as { items: unknown[] }).items).toHaveLength(1);
    for (const target of [
      mixed,
      outside,
      zero,
      elevatedAdmin,
      elevatedManager,
      { membershipId: actor.membership.membershipId },
    ]) {
      await expectHidden(
        await fixture.managementGet(
          staffPath(org, target.membershipId),
          actor.auth.accessToken,
        ),
      );
    }
    await expectHidden(
      await fixture.managementGet(
        `${staffPath(org)}?locationId=${actor.locationC.locationId}`,
        actor.auth.accessToken,
      ),
    );
  }, 15_000);

  it("binds directory cursors to the current LM active grant-set fingerprint", async () => {
    const actor = await createLm();
    const org = actor.membership.organizationId;
    await addTarget(org, "VALET_EMPLOYEE", [actor.locationA.locationId]);
    await addTarget(org, "VALET_EMPLOYEE", [actor.locationA.locationId]);
    const first = await fixture.managementGet(
      `${staffPath(org)}?limit=1`,
      actor.auth.accessToken,
    );
    expect(first.status).toBe(200);
    const cursor = String((first.body as { nextCursor: string }).nextCursor);
    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE membership_id=$1 AND location_id=$2`,
      [actor.membership.membershipId, actor.locationB.locationId],
    );
    const stale = await fixture.managementGet(
      `${staffPath(org)}?limit=1&cursor=${encodeURIComponent(cursor)}`,
      actor.auth.accessToken,
    );
    expect(stale.status).toBe(400);
    expect(stale.body).toMatchObject({ code: "REQUEST_INVALID" });
  });
});
