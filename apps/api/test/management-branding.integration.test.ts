import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function companyPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/branding`;
}

function locationPath(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/branding`;
}

function expected(body: Record<string, unknown>, updatedAt: unknown) {
  return { ...body, expectedUpdatedAt: String(updatedAt) };
}

async function assuredAdmin(name = "Branding company") {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name });
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
  return { auth, factor, membership, user };
}

async function auditCount(organizationId: string, eventType: string) {
  const result = await fixture.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE organization_id=$1 AND event_type=$2`,
    [organizationId, eventType],
  );
  return result.rows[0]?.count;
}

describe("MGT-BE-05 Company branding Management", () => {
  it("reads Company defaults and sets trimmed ASCII/Arabic names plus canonical color", async () => {
    const actor = await assuredAdmin("Original brand");
    const path = companyPath(actor.membership.organizationId);
    const initial = await fixture.managementGet(path, actor.auth.accessToken);
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      displayName: "Original brand",
      organizationId: actor.membership.organizationId,
      primaryColor: "#176BFF",
    });

    const ascii = await fixture.managementPut(
      `${path}/default`,
      actor.auth.accessToken,
      expected({ setting: "brandDisplayName", value: "  VAYLET Jordan  " }, initial.body?.updatedAt),
    );
    expect(ascii.status).toBe(200);
    expect(ascii.body?.displayName).toBe("VAYLET Jordan");

    const arabic = await fixture.managementPut(
      `${path}/default`,
      actor.auth.accessToken,
      expected({ setting: "brandDisplayName", value: "  فاليه الأردن  " }, ascii.body?.updatedAt),
    );
    expect(arabic.status).toBe(200);
    expect(arabic.body?.displayName).toBe("فاليه الأردن");

    const color = await fixture.managementPut(
      `${path}/default`,
      actor.auth.accessToken,
      expected({ setting: "brandPrimaryColor", value: "#A1B2C3" }, arabic.body?.updatedAt),
    );
    expect(color.status).toBe(200);
    expect(color.body).toMatchObject({ displayName: "فاليه الأردن", primaryColor: "#A1B2C3" });
  });

  it("rejects non-canonical colors and invalid display names without mutation", async () => {
    const actor = await assuredAdmin("Validation brand");
    const path = companyPath(actor.membership.organizationId);
    const initial = await fixture.managementGet(path, actor.auth.accessToken);
    const token = initial.body?.updatedAt;
    const invalid = [
      { setting: "brandPrimaryColor", value: "#a1b2c3" },
      { setting: "brandPrimaryColor", value: "#ABC" },
      { setting: "brandDisplayName", value: "   " },
      { setting: "brandDisplayName", value: "Bad\u0007Name" },
      { setting: "brandDisplayName", value: "🚗".repeat(121) },
    ];
    for (const command of invalid) {
      const result = await fixture.managementPut(
        `${path}/default`, actor.auth.accessToken, expected(command, token),
      );
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ code: "REQUEST_INVALID" });
    }
    const current = await fixture.managementGet(path, actor.auth.accessToken);
    expect(current.body).toMatchObject({
      displayName: "Validation brand",
      primaryColor: "#176BFF",
      updatedAt: token,
    });
  });

  it("inherits, sets, and clears exact-Location display name and color overrides", async () => {
    const actor = await assuredAdmin("Company brand");
    const location = await fixture.addLocation(actor.membership.organizationId);
    const path = locationPath(actor.membership.organizationId, location.locationId);
    const initial = await fixture.managementGet(path, actor.auth.accessToken);
    expect(initial.body).toMatchObject({
      displayName: { default: "Company brand", effective: "Company brand", override: null, overridePresent: false },
      primaryColor: { default: "#176BFF", effective: "#176BFF", override: null, overridePresent: false },
    });

    const named = await fixture.managementPut(
      `${path}/override`, actor.auth.accessToken,
      expected({ setting: "brandDisplayName", value: "  بوابة الفندق  " }, initial.body?.updatedAt),
    );
    expect(named.body?.displayName).toMatchObject({ effective: "بوابة الفندق", override: "بوابة الفندق", overridePresent: true });
    const colored = await fixture.managementPut(
      `${path}/override`, actor.auth.accessToken,
      expected({ setting: "brandPrimaryColor", value: "#ABCDEF" }, named.body?.updatedAt),
    );
    expect(colored.body?.primaryColor).toMatchObject({ effective: "#ABCDEF", override: "#ABCDEF", overridePresent: true });

    const clearName = await fixture.managementPost(
      `${path}/override/clear`, actor.auth.accessToken,
      expected({ setting: "brandDisplayName" }, colored.body?.updatedAt),
    );
    expect(clearName.status).toBe(201);
    expect(clearName.body?.displayName).toMatchObject({ effective: "Company brand", override: null, overridePresent: false });
    const clearColor = await fixture.managementPost(
      `${path}/override/clear`, actor.auth.accessToken,
      expected({ setting: "brandPrimaryColor" }, clearName.body?.updatedAt),
    );
    expect(clearColor.status).toBe(201);
    expect(clearColor.body?.primaryColor).toMatchObject({ effective: "#176BFF", override: null, overridePresent: false });
  });

  it("keeps STANDARD reads available while stale SENSITIVE writes require soft step-up", async () => {
    const actor = await assuredAdmin();
    const path = companyPath(actor.membership.organizationId);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [actor.auth.sessionId],
    );
    const read = await fixture.managementGet(path, actor.auth.accessToken);
    expect(read.status).toBe(200);
    const denied = await fixture.managementPut(
      `${path}/default`, actor.auth.accessToken,
      expected({ setting: "brandPrimaryColor", value: "#010203" }, read.body?.updatedAt),
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect((await fixture.sessionSnapshot(actor.auth.sessionId)).rows[0]?.revoked_at).toBeNull();
    expect((await fixture.stepUp(actor.auth, actor.factor.secret)).status).toBe(200);
    const changed = await fixture.managementPut(
      `${path}/default`, actor.auth.accessToken,
      expected({ setting: "brandPrimaryColor", value: "#010203" }, read.body?.updatedAt),
    );
    expect(changed.status).toBe(200);
    expect(changed.body?.primaryColor).toBe("#010203");
  });

  it("accepts a desired-state no-op with a stale token without CAS or extra audit", async () => {
    const actor = await assuredAdmin("No-op original");
    const path = companyPath(actor.membership.organizationId);
    const initial = await fixture.managementGet(path, actor.auth.accessToken);
    const changed = await fixture.managementPut(
      `${path}/default`, actor.auth.accessToken,
      expected({ setting: "brandDisplayName", value: "Converged" }, initial.body?.updatedAt),
    );
    expect(changed.status).toBe(200);
    const before = await auditCount(actor.membership.organizationId, "MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED");
    const retry = await fixture.managementPut(
      `${path}/default`, actor.auth.accessToken,
      expected({ setting: "brandDisplayName", value: "  Converged  " }, initial.body?.updatedAt),
    );
    expect(retry.status).toBe(200);
    expect(retry.body?.updatedAt).toBe(changed.body?.updatedAt);
    expect(await auditCount(actor.membership.organizationId, "MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED")).toBe(before);
  });

  it("rejects a divergent stale CAS token without mutation or audit", async () => {
    const actor = await assuredAdmin("CAS original");
    const path = companyPath(actor.membership.organizationId);
    const initial = await fixture.managementGet(path, actor.auth.accessToken);
    const changed = await fixture.managementPut(
      `${path}/default`, actor.auth.accessToken,
      expected({ setting: "brandDisplayName", value: "First" }, initial.body?.updatedAt),
    );
    const before = await auditCount(actor.membership.organizationId, "MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED");
    const conflict = await fixture.managementPut(
      `${path}/default`, actor.auth.accessToken,
      expected({ setting: "brandDisplayName", value: "Second" }, initial.body?.updatedAt),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "CONFIGURATION_CONFLICT" });
    const current = await fixture.managementGet(path, actor.auth.accessToken);
    expect(current.body).toMatchObject({ displayName: "First", updatedAt: changed.body?.updatedAt });
    expect(await auditCount(actor.membership.organizationId, "MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED")).toBe(before);
  });

  it("conceals cross-Organization locations and binds multi-org writes to the exact membership", async () => {
    const actor = await assuredAdmin("Org A");
    const second = await fixture.createMembership(actor.user.id, { name: "Org B" });
    const secondLocation = await fixture.addLocation(second.organizationId);
    const foreign = await fixture.managementGet(
      locationPath(actor.membership.organizationId, secondLocation.locationId),
      actor.auth.accessToken,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const secondRead = await fixture.managementGet(companyPath(second.organizationId), actor.auth.accessToken);
    expect(secondRead.status).toBe(200);
    const changed = await fixture.managementPut(
      `${companyPath(second.organizationId)}/default`, actor.auth.accessToken,
      expected({ setting: "brandPrimaryColor", value: "#112233" }, secondRead.body?.updatedAt),
    );
    expect(changed.status).toBe(200);
    const audit = await fixture.query<{ actor_membership_id: string; organization_id: string }>(
      `SELECT actor_membership_id::text,organization_id::text FROM audit_events
       WHERE organization_id=$1 AND event_type='MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED'
       ORDER BY occurred_at DESC LIMIT 1`,
      [second.organizationId],
    );
    expect(audit.rows[0]).toEqual({
      actor_membership_id: second.membershipId,
      organization_id: second.organizationId,
    });
    const firstRead = await fixture.managementGet(companyPath(actor.membership.organizationId), actor.auth.accessToken);
    expect(firstRead.body?.primaryColor).toBe("#176BFF");
  });
});
