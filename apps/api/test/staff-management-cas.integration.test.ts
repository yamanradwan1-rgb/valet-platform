import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

async function target() {
  const actor = await assuredAdmin();
  const user = await fixture.createUser();
  const membershipId = await fixture.addMembership(
    actor.membership.organizationId,
    user.id,
    "VALET_EMPLOYEE",
  );
  const location = await fixture.addLocation(actor.membership.organizationId);
  const base = `/v1/staff/management/organizations/${actor.membership.organizationId}/staff/${membershipId}`;
  return { actor, base, locationId: location.locationId, membershipId };
}

describe("MGT-BE-04 membership revision CAS and desired state", () => {
  it("increments status exactly once and keeps exact desired-state retries audit-free", async () => {
    const value = await target();
    const deactivated = await fixture.managementPost(
      `${value.base}/deactivate`,
      value.actor.auth.accessToken,
      { expectedVersion: 1 },
    );
    expect(deactivated.body).toMatchObject({ status: "INACTIVE", version: 2 });
    const retry = await fixture.managementPost(
      `${value.base}/deactivate`,
      value.actor.auth.accessToken,
      { expectedVersion: 1 },
    );
    expect(retry.body).toMatchObject({ status: "INACTIVE", version: 2 });
    const activated = await fixture.managementPost(
      `${value.base}/activate`,
      value.actor.auth.accessToken,
      { expectedVersion: 2 },
    );
    expect(activated.body).toMatchObject({ status: "ACTIVE", version: 3 });
    const audits = await fixture.query<{ event_type: string }>(
      `SELECT event_type FROM audit_events
       WHERE entity_id=$1 AND event_type IN
         ('STAFF_MEMBERSHIP_ACTIVATED','STAFF_MEMBERSHIP_DEACTIVATED')
       ORDER BY event_type`,
      [value.membershipId],
    );
    expect(audits.rows.map((row) => row.event_type).sort()).toEqual([
      "STAFF_MEMBERSHIP_ACTIVATED",
      "STAFF_MEMBERSHIP_DEACTIVATED",
    ]);
  });

  it("serializes opposite status intents without a lost update", async () => {
    const value = await target();
    const [deactivate, activate] = await Promise.all([
      fixture.managementPost(`${value.base}/deactivate`, value.actor.auth.accessToken, {
        expectedVersion: 1,
      }),
      fixture.managementPost(`${value.base}/activate`, value.actor.auth.accessToken, {
        expectedVersion: 1,
      }),
    ]);
    expect(deactivate.status).toBe(201);
    expect([201, 409]).toContain(activate.status);
    const current = await fixture.query<{ status: string; version: number }>(
      `SELECT status::text,version FROM organization_memberships WHERE id=$1`,
      [value.membershipId],
    );
    expect(current.rows[0]).toEqual({ status: "INACTIVE", version: 2 });
    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE entity_id=$1 AND event_type='STAFF_MEMBERSHIP_DEACTIVATED'`,
      [value.membershipId],
    );
    expect(audit.rows[0]?.count).toBe("1");
  });

  it("serializes status versus grant on the same membership revision", async () => {
    const value = await target();
    const results = await Promise.all([
      fixture.managementPost(`${value.base}/deactivate`, value.actor.auth.accessToken, {
        expectedVersion: 1,
      }),
      fixture.managementPost(
        `${value.base}/location-access/grant`,
        value.actor.auth.accessToken,
        { expectedVersion: 1, locationIds: [value.locationId] },
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const current = await fixture.query<{
      grants: string;
      status: string;
      version: number;
    }>(
      `SELECT membership.status::text,membership.version,
              (SELECT count(*)::text FROM membership_location_access AS access
               WHERE access.membership_id=membership.id) AS grants
       FROM organization_memberships AS membership WHERE membership.id=$1`,
      [value.membershipId],
    );
    expect(current.rows[0]?.version).toBe(2);
    expect(
      (current.rows[0]?.status === "INACTIVE" && current.rows[0]?.grants === "0") ||
        (current.rows[0]?.status === "ACTIVE" && current.rows[0]?.grants === "1"),
    ).toBe(true);
  });
});
