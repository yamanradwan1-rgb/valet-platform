import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function base(org: string) {
  return `/v1/staff/management/organizations/${org}/guest-information`;
}

function locationBase(org: string, loc: string) {
  return `/v1/staff/management/organizations/${org}/locations/${loc}/guest-information`;
}

async function assuredActor() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { user, membership, auth };
}

const contact = (displayName: string) => ({
  displayName, phone: null, supportUrl: null, hours: null, hoursConfirmed: false,
});

describe("#316 Staff authority, scope and concurrency", () => {
  it("shows Location Managers only current granted Locations and preserves MFA", async () => {
    const admin = await assuredActor();
    const organizationId = admin.membership.organizationId;
    const first = await fixture.addLocation(organizationId, { name: "First" });
    const second = await fixture.addLocation(organizationId, { name: "Hidden" });
    const saved = await fixture.managementPut(
      `${locationBase(organizationId, second.locationId)}/privacy`, admin.auth.accessToken,
      { expectedRevision: 0, drafts: {
        en: { text: "Hidden policy", url: "" }, ar: { text: "", url: "" },
      } });
    expect(saved.status).toBe(200);
    expect((await fixture.managementPost(
      `${locationBase(organizationId, second.locationId)}/privacy/publish`,
      admin.auth.accessToken, { expectedRevision: 1 })).status).toBe(201);

    const user = await fixture.createUser();
    const memberId = await fixture.addMembership(organizationId, user.id, "LOCATION_MANAGER");
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`, [organizationId, memberId, first.locationId]);
    const manager = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(manager);
    const overview = await fixture.managementGet(`${base(organizationId)}/overview?locale=en`,
      manager.accessToken);
    expect(overview.status).toBe(200);
    expect(overview.body).toMatchObject({ publishedCount: 0, locations: [{ id: first.locationId }] });
    expect(overview.body?.locations).toHaveLength(1);
    expect(JSON.stringify(overview.body)).not.toContain("Hidden");

    const companyDenied = await fixture.managementGet(
      `${base(organizationId)}/contact/defaults`, manager.accessToken);
    expect(companyDenied.status).toBe(404);
    expect((await fixture.managementGet(
      `${locationBase(organizationId, second.locationId)}/privacy`,
      manager.accessToken)).status).toBe(404);

    const localSave = await fixture.managementPut(
      `${locationBase(organizationId, first.locationId)}/privacy`, manager.accessToken,
      { expectedRevision: 0, drafts: {
        en: { text: "Manager-owned", url: "" }, ar: { text: "", url: "" },
      } });
    expect(localSave.status).toBe(200);
    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [organizationId, memberId, first.locationId]);
    expect((await fixture.managementGet(
      `${locationBase(organizationId, first.locationId)}/privacy`,
      manager.accessToken)).status).toBe(404);
    expect((await fixture.managementGet(`${base(organizationId)}/overview?locale=en`,
      admin.auth.accessToken)).body?.publishedCount).toBe(1);
  });

  it("serializes optimistic contact changes with exactly one successful audit", async () => {
    const admin = await assuredActor();
    const company = `${base(admin.membership.organizationId)}/contact/defaults`;
    const commands = [
      { expectedRevision: 0, values: contact("Parallel A") },
      { expectedRevision: 0, values: contact("Parallel B") },
    ];
    const results = await Promise.all(commands.map((command) =>
      fixture.managementPut(company, admin.auth.accessToken, command)));
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND event_type='MANAGEMENT_GUEST_INFORMATION_CHANGED'
         AND metadata_json->>'operation'='CONTACT_COMPANY_DEFAULTS_SAVED'`,
      [admin.membership.organizationId]);
    expect(audit.rows[0]?.count).toBe("1");
  });

  it("fails closed after Staff session revocation and rejects stale sensitive MFA", async () => {
    const admin = await assuredActor();
    const organizationId = admin.membership.organizationId;
    const location = await fixture.addLocation(organizationId);
    const privacy = `${locationBase(organizationId, location.locationId)}/privacy`;
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET mfa_authenticated_at=clock_timestamp()-interval '6 minutes'
       WHERE id=$1`, [admin.auth.sessionId]);
    const stale = await fixture.managementPut(privacy, admin.auth.accessToken, {
      expectedRevision: 0, drafts: {
        en: { text: "Restricted", url: "" }, ar: { text: "", url: "" },
      },
    });
    expect(stale.status).toBe(403);
    expect(stale.body?.code).toBe("MFA_STEP_UP_REQUIRED");
    await fixture.query(
      `UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`,
      [admin.auth.sessionId]);
    const revoked = await fixture.managementGet(privacy, admin.auth.accessToken);
    expect(revoked.status).toBe(401);
    expect(revoked.body?.code).toBe("STAFF_AUTHENTICATION_REQUIRED");
  });
});
