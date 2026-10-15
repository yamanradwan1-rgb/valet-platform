import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

const pathFor = (org: string, location?: string) =>
  "/v1/staff/management/organizations/" + org +
  (location ? "/locations/" + location : "") + "/whatsapp-settings";

const disabled = {
  enabled: false, language: "ar", templateCatalogVersion: null,
  providerBindingId: null, revision: 0, expectedRevision: 0,
};

async function actor(role: "ORG_ADMIN" | "LOCATION_MANAGER" = "ORG_ADMIN") {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { role });
  const auth = await fixture.nativeLogin(user);
  const factor = role === "ORG_ADMIN" ? await fixture.enrollAndAssure(auth) : null;
  return { membership, auth, factor };
}

describe("WhatsApp Dashboard server authority and activation gate", () => {
  it("defaults to no real sending and truthful binding state", async () => {
    const admin = await actor();
    const response = await fixture.managementGet(
      pathFor(admin.membership.organizationId), admin.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      organizationId: admin.membership.organizationId,
      globalSendEnabled: false, activationReady: false,
      connections: [], approvedTemplateVersions: [],
    });
    expect(JSON.stringify(response.body)).not.toContain("credentialAlias");
  });

  it("denies cross-organization and cross-location requests", async () => {
    const admin = await actor();
    const otherOrg = await fixture.createOrganization();
    expect((await fixture.managementGet(pathFor(otherOrg),
      admin.auth.accessToken)).status).not.toBe(200);
    expect((await fixture.managementPut(pathFor(otherOrg),
      admin.auth.accessToken, disabled)).status).not.toBe(200);
    const location = await fixture.addLocation(otherOrg);
    expect((await fixture.managementPut(
      pathFor(admin.membership.organizationId, location.locationId),
      admin.auth.accessToken, disabled,
    )).status).not.toBe(200);
  });

  it("rejects non-admin and fabricated template approval", async () => {
    const manager = await actor("LOCATION_MANAGER");
    expect((await fixture.managementGet(pathFor(manager.membership.organizationId),
      manager.auth.accessToken)).status).not.toBe(200);
    const admin = await actor();
    const path = pathFor(admin.membership.organizationId);
    const response = await fixture.managementPut(path, admin.auth.accessToken, {
      ...disabled, enabled: true, templateCatalogVersion: "fake-approval",
    });
    expect(response.status).toBe(400);
    const after = await fixture.managementGet(path, admin.auth.accessToken);
    expect((after.body?.policy as { revision?: number } | undefined)?.revision).toBe(0);
  });

  it("requires fresh MFA, audits successful write, and rejects stale revision", async () => {
    const admin = await actor();
    const path = pathFor(admin.membership.organizationId);
    await fixture.query(
      "UPDATE staff_auth_sessions SET created_at=clock_timestamp()-interval '2 hours', " +
      "mfa_authenticated_at=clock_timestamp()-interval '6 minutes', " +
      "last_admin_activity_at=clock_timestamp()-interval '1 minute' WHERE id=$1",
      [admin.auth.sessionId],
    );
    const stale = await fixture.managementPut(path, admin.auth.accessToken, disabled);
    expect(stale.status).toBe(403);
    expect(stale.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect((await fixture.stepUp(admin.auth, admin.factor!.secret)).status).toBe(200);
    const saved = await fixture.managementPut(path, admin.auth.accessToken, disabled);
    expect(saved.status).toBe(200);
    expect((saved.body?.policy as { revision?: number } | undefined)?.revision).toBe(1);
    expect((await fixture.managementPut(path, admin.auth.accessToken, disabled)).status)
      .toBe(409);
    const count = await fixture.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events WHERE organization_id=$1 " +
      "AND event_type='MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED'",
      [admin.membership.organizationId],
    );
    expect(count.rows[0]?.count).toBe("1");
  });
});
