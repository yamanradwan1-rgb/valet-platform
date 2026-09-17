import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function locationBase(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}`;
}

function createBody() {
  return {
    addressText: "Preactivation address",
    code: `PRE-${randomUUID().slice(0, 8)}`,
    currency: "JOD",
    name: "Preactivation Location",
    operationId: randomUUID(),
    timezone: "Asia/Amman",
  };
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    name: "Preactivation org",
  });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

describe("MGT-BE-07 preactivation Location setup", () => {
  it("lets Company Admin configure settings and branding while the new Location is still INACTIVE", async () => {
    const admin = await assuredAdmin();
    const created = await fixture.managementPost(
      `/v1/staff/management/organizations/${admin.membership.organizationId}/locations`,
      admin.auth.accessToken,
      createBody(),
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: "INACTIVE",
      acceptingIntake: false,
    });

    const locationId = String(created.body?.locationId);
    const base = locationBase(admin.membership.organizationId, locationId);
    const settings = await fixture.managementGet(
      `${base}/settings`,
      admin.auth.accessToken,
    );
    expect(settings.status).toBe(200);
    const settingChanged = await fixture.managementPut(
      `${base}/settings/override`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: String(settings.body?.updatedAt),
        setting: "parkingSpotRequired",
        value: false,
      },
    );
    expect(settingChanged.status).toBe(200);
    expect(settingChanged.body?.settings).toMatchObject({
      parkingSpotRequired: {
        effective: false,
        override: false,
        overridePresent: true,
      },
    });

    const branding = await fixture.managementGet(
      `${base}/branding`,
      admin.auth.accessToken,
    );
    expect(branding.status).toBe(200);
    const brandChanged = await fixture.managementPut(
      `${base}/branding/override`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: String(branding.body?.updatedAt),
        setting: "brandDisplayName",
        value: "بوابة ما قبل التشغيل",
      },
    );
    expect(brandChanged.status).toBe(200);
    expect(brandChanged.body?.displayName).toMatchObject({
      effective: "بوابة ما قبل التشغيل",
      override: "بوابة ما قبل التشغيل",
      overridePresent: true,
    });

    const lifecycle = await fixture.managementGet(
      `${base}/lifecycle`,
      admin.auth.accessToken,
    );
    expect(lifecycle.status).toBe(200);
    expect(lifecycle.body).toMatchObject({
      status: "INACTIVE",
      acceptingIntake: false,
    });
  });

  it("does not broaden Location Manager settings or branding authority for an inactive granted Location", async () => {
    const admin = await assuredAdmin();
    const created = await fixture.managementPost(
      `/v1/staff/management/organizations/${admin.membership.organizationId}/locations`,
      admin.auth.accessToken,
      createBody(),
    );
    const locationId = String(created.body?.locationId);

    const managerUser = await fixture.createUser();
    const managerMembershipId = await fixture.addMembership(
      admin.membership.organizationId,
      managerUser.id,
      "LOCATION_MANAGER",
    );
    await fixture.grantLocationAccess(
      admin.membership.organizationId,
      managerMembershipId,
      locationId,
    );
    const managerAuth = await fixture.nativeLogin(managerUser);
    const base = locationBase(admin.membership.organizationId, locationId);

    const settings = await fixture.managementGet(
      `${base}/settings`,
      managerAuth.accessToken,
    );
    expect(settings.status).toBe(404);
    expect(settings.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const branding = await fixture.managementGet(
      `${base}/branding`,
      managerAuth.accessToken,
    );
    expect(branding.status).toBe(404);
    expect(branding.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const lifecycle = await fixture.managementGet(
      `${base}/lifecycle`,
      managerAuth.accessToken,
    );
    expect(lifecycle.status).toBe(404);
    expect(lifecycle.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
