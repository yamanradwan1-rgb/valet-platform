import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

const fixture = new ManagementVisitContactTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function correctionPath(organizationId: string, customerId: string, kind: "name" | "phone") {
  return `/v1/staff/management/organizations/${organizationId}/visit-contacts/${customerId}/${kind}-correction`;
}

async function admin() {
  const user = await fixture.createUser();
  const organizationId = await fixture.createOrganization();
  const membershipId = await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membershipId, organizationId };
}

describe("MGT-BE-08 Visit Contact corrections", () => {
  it("corrects name atomically with one safe known audit and preserves visit linkage", async () => {
    const actor = await admin();
    const location = await fixture.addLocation(actor.organizationId);
    const customerId = await fixture.createCustomer(actor.organizationId, "+962790070707", "Old Name");
    const vehicleId = await fixture.createVehicle(actor.organizationId, { plateNumber: "CR-1" });
    const visitId = await fixture.createVisit({ customerId, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId, vehicleId });
    const before = await fixture.customerState(customerId);

    const response = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "name"), actor.auth.accessToken,
      { displayName: "Correct Name", expectedUpdatedAt: before.updated_at.toISOString() },
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ changed: true, customerId });
    expect((await fixture.customerState(customerId)).display_name).toBe("Correct Name");
    const linked = await fixture.query<{ customer_id: string }>(
      `SELECT customer_id::text FROM valet_sessions WHERE id=$1`, [visitId],
    );
    expect(linked.rows[0]?.customer_id).toBe(customerId);
    const audit = await fixture.eventRows(actor.organizationId, "VISIT_CONTACT_NAME_CORRECTED");
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      actor_membership_id: actor.membershipId,
      location_id: null,
      metadata_json: { field: "displayName" },
    });
    expect(JSON.stringify(audit.rows[0])).not.toContain("Old Name");
    expect(JSON.stringify(audit.rows[0])).not.toContain("Correct Name");

    const explorer = await fixture.managementGet(
      `/v1/staff/management/organizations/${actor.organizationId}/audit-events?eventType=VISIT_CONTACT_NAME_CORRECTED`,
      actor.auth.accessToken,
    );
    expect(explorer.status).toBe(200);
    expect(explorer.body?.items).toEqual([
      expect.objectContaining({
        details: { field: "displayName", kind: "MANAGEMENT" },
        entity: { id: customerId, type: "CUSTOMER" },
        eventType: "VISIT_CONTACT_NAME_CORRECTED",
      }),
    ]);
  });

  it("normalizes phone, allows duplicate identity without merge, and audits no raw phone", async () => {
    const actor = await admin();
    const customerId = await fixture.createCustomer(actor.organizationId, "+962790080800", "First");
    const duplicateId = await fixture.createCustomer(actor.organizationId, "+962790080808", "Duplicate");
    const before = await fixture.customerState(customerId);
    const body = { expectedUpdatedAt: before.updated_at.toISOString(), phone: "079 008 0808" };
    const response = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "phone"), actor.auth.accessToken,
      body,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ changed: true, customerId });
    const current = await fixture.customerState(customerId);
    expect(current.phone_normalized).toBe("+962790080808");
    expect((await fixture.customerState(duplicateId)).phone_normalized).toBe("+962790080808");
    const retry = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "phone"), actor.auth.accessToken, body,
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({
      changed: false,
      updatedAt: current.updated_at.toISOString(),
    });
    const divergent = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "phone"), actor.auth.accessToken,
      { expectedUpdatedAt: before.updated_at.toISOString(), phone: "079 008 0818" },
    );
    expect(divergent.status).toBe(409);
    expect(divergent.body).toMatchObject({ code: "VERSION_CONFLICT" });
    expect((await fixture.customerState(customerId)).phone_normalized).toBe("+962790080808");
    const audits = await fixture.eventRows(actor.organizationId, "VISIT_CONTACT_PHONE_CORRECTED");
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]?.metadata_json).toEqual({
      field: "phoneNormalized",
      normalizationVersion: "JORDAN_MOBILE_V1",
    });
    expect(JSON.stringify(audits.rows)).not.toContain("+962790080808");
  });

  it("makes exact-value retry a no-op and stale CAS a conflict without extra audit", async () => {
    const actor = await admin();
    const customerId = await fixture.createCustomer(actor.organizationId, "+962790090909", "Start");
    const before = await fixture.customerState(customerId);
    const body = { displayName: "Changed", expectedUpdatedAt: before.updated_at.toISOString() };
    const first = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "name"), actor.auth.accessToken,
      body,
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ changed: true, customerId });
    const current = await fixture.customerState(customerId);
    const retry = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "name"), actor.auth.accessToken,
      body,
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({
      changed: false,
      updatedAt: current.updated_at.toISOString(),
    });
    const stale = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "name"), actor.auth.accessToken,
      { displayName: "Different", expectedUpdatedAt: before.updated_at.toISOString() },
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "VERSION_CONFLICT" });
    expect((await fixture.customerState(customerId)).display_name).toBe("Changed");
    expect((await fixture.eventRows(actor.organizationId, "VISIT_CONTACT_NAME_CORRECTED")).rows)
      .toHaveLength(1);
  });

  it("gives concurrent different corrections one winner", async () => {
    const actor = await admin();
    const customerId = await fixture.createCustomer(actor.organizationId, "+962790100100", "Race");
    const before = await fixture.customerState(customerId);
    const body = (displayName: string) => ({
      displayName,
      expectedUpdatedAt: before.updated_at.toISOString(),
    });
    const [a, b] = await Promise.all([
      fixture.managementPost(correctionPath(actor.organizationId, customerId, "name"),
        actor.auth.accessToken, body("Winner A")),
      fixture.managementPost(correctionPath(actor.organizationId, customerId, "name"),
        actor.auth.accessToken, body("Winner B")),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await fixture.eventRows(actor.organizationId, "VISIT_CONTACT_NAME_CORRECTED")).rows)
      .toHaveLength(1);
  });

  it("requires five-minute MFA and denies Location Manager correction authority", async () => {
    const actor = await admin();
    const customerId = await fixture.createCustomer(actor.organizationId, "+962790110110", "Freshness");
    const state = await fixture.customerState(customerId);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '10 minutes',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [actor.auth.sessionId],
    );
    const stale = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "name"), actor.auth.accessToken,
      { displayName: "Blocked", expectedUpdatedAt: state.updated_at.toISOString() },
    );
    expect(stale.status).toBe(403);
    expect(stale.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect((await fixture.eventRows(actor.organizationId, "VISIT_CONTACT_NAME_CORRECTED")).rows)
      .toHaveLength(0);

    const managerUser = await fixture.createUser();
    const managerMembership = await fixture.addMembership(
      actor.organizationId, managerUser.id, "LOCATION_MANAGER",
    );
    const location = await fixture.addLocation(actor.organizationId);
    await fixture.grantLocationAccess(actor.organizationId, managerMembership, location.locationId);
    const managerAuth = await fixture.nativeLogin(managerUser);
    const denied = await fixture.managementPost(
      correctionPath(actor.organizationId, customerId, "name"), managerAuth.accessToken,
      { displayName: "Blocked", expectedUpdatedAt: state.updated_at.toISOString() },
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("rejects invalid corrections without audit", async () => {
    const actor = await admin();
    const customerId = await fixture.createCustomer(actor.organizationId, "+962790120120", "Invalid");
    const state = await fixture.customerState(customerId);
    for (const request of [
      fixture.managementPost(correctionPath(actor.organizationId, customerId, "phone"),
        actor.auth.accessToken, { expectedUpdatedAt: state.updated_at.toISOString(), phone: "+14155552671" }),
      fixture.managementPost(correctionPath(actor.organizationId, customerId, "name"),
        actor.auth.accessToken, { displayName: "bad\u0000name", expectedUpdatedAt: state.updated_at.toISOString() }),
    ]) {
      expect((await request).status).toBe(400);
    }
    expect((await fixture.eventRows(actor.organizationId)).rows).toHaveLength(0);
  });
});
