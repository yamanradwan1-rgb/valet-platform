import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

class LocalMfaBypassFixture extends ManagementControlPlaneTestFixture {
  private readonly localBypassEnvironment = {
    bypass: process.env.VAYLET_LOCAL_DISABLE_MFA,
    nodeEnv: process.env.NODE_ENV,
  };

  override async start(): Promise<void> {
    process.env.NODE_ENV = "development";
    process.env.VAYLET_LOCAL_DISABLE_MFA = "true";
    try {
      await super.start();
    } catch (error) {
      this.restoreLocalBypassEnvironment();
      throw error;
    }
  }

  override async stop(): Promise<void> {
    try {
      await super.stop();
    } finally {
      this.restoreLocalBypassEnvironment();
    }
  }

  private restoreLocalBypassEnvironment(): void {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("NODE_ENV", this.localBypassEnvironment.nodeEnv);
    restore(
      "VAYLET_LOCAL_DISABLE_MFA",
      this.localBypassEnvironment.bypass,
    );
  }
}

const fixture = new LocalMfaBypassFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function brandingPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/branding`;
}

async function passwordOnlyAdmin(options: { entitled?: boolean } = {}) {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, options);
  const auth = await fixture.nativeLogin(user);
  return { auth, membership, user };
}

describe("local development MFA bypass", () => {
  it("keeps authentication, session validity, and active-user checks mandatory", async () => {
    const actor = await passwordOnlyAdmin();
    const path = brandingPath(actor.membership.organizationId);

    expect((await fixture.request(path, { method: "GET" })).status).toBe(401);
    expect((await fixture.managementGet(path, "invalid-token")).status).toBe(401);
    expect(
      (await fixture.request("/v1/staff/auth/mfa/state", { method: "GET" }))
        .status,
    ).toBe(401);
    expect(
      (await fixture.getMfa("/v1/staff/auth/mfa/state", "invalid-token"))
        .status,
    ).toBe(401);

    await fixture.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
      [actor.auth.sessionId],
    );
    expect((await fixture.managementGet(path, actor.auth.accessToken)).status)
      .toBe(401);

    const expired = await passwordOnlyAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET access_expires_at=created_at + INTERVAL '1 millisecond'
       WHERE id=$1`,
      [expired.auth.sessionId],
    );
    expect(
      (await fixture.managementGet(
        brandingPath(expired.membership.organizationId),
        expired.auth.accessToken,
      )).status,
    ).toBe(401);

    const disabled = await passwordOnlyAdmin();
    await fixture.query(
      "UPDATE users SET status='DISABLED' WHERE id=$1",
      [disabled.user.id],
    );
    expect(
      (await fixture.managementGet(
        brandingPath(disabled.membership.organizationId),
        disabled.auth.accessToken,
      )).status,
    ).toBe(401);
  });

  it("bypasses standard MFA only after exact session and Company Admin checks", async () => {
    const actor = await passwordOnlyAdmin();
    expect((await fixture.factors(actor.user.id)).rowCount).toBe(0);
    const before = (await fixture.sessionSnapshot(actor.auth.sessionId)).rows[0]!;
    expect(before.mfa_authenticated_at).toBeNull();
    expect(before.mfa_factor_id).toBeNull();
    expect(before.last_admin_activity_at).toBeNull();

    const state = await fixture.getMfa(
      "/v1/staff/auth/mfa/state",
      actor.auth.accessToken,
    );
    expect(state.status).toBe(200);
    expect(state.body).toEqual({ state: "ASSURED" });

    const read = await fixture.managementGet(
      brandingPath(actor.membership.organizationId),
      actor.auth.accessToken,
    );
    expect(read.status).toBe(200);
    const after = (await fixture.sessionSnapshot(actor.auth.sessionId)).rows[0]!;
    expect(after.mfa_authenticated_at).toBeNull();
    expect(after.mfa_factor_id).toBeNull();
    expect(after.last_admin_activity_at).toBeNull();
  });

  it("keeps role, tenant, and commercial entitlement boundaries unchanged", async () => {
    const organizationId = await fixture.createOrganization();
    for (const role of [
      "LOCATION_MANAGER",
      "VALET_SUPERVISOR",
      "VALET_EMPLOYEE",
    ] as const) {
      const user = await fixture.createUser();
      await fixture.addMembership(organizationId, user.id, role);
      const auth = await fixture.nativeLogin(user);
      const response = await fixture.managementGet(
        brandingPath(organizationId),
        auth.accessToken,
      );
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }

    const admin = await passwordOnlyAdmin();
    const foreignOrganization = await fixture.createOrganization();
    const foreign = await fixture.managementGet(
      brandingPath(foreignOrganization),
      admin.auth.accessToken,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const unentitled = await passwordOnlyAdmin({ entitled: false });
    const commercial = await fixture.managementGet(
      brandingPath(unentitled.membership.organizationId),
      unentitled.auth.accessToken,
    );
    expect(commercial.status).toBe(404);
    expect(commercial.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("bypasses sensitive freshness while preserving validation and CAS", async () => {
    const actor = await passwordOnlyAdmin();
    const path = brandingPath(actor.membership.organizationId);
    const read = await fixture.managementGet(path, actor.auth.accessToken);
    expect(read.status).toBe(200);
    const expectedUpdatedAt = String(read.body?.updatedAt);

    const changed = await fixture.managementPut(
      `${path}/default`,
      actor.auth.accessToken,
      {
        expectedUpdatedAt,
        setting: "brandPrimaryColor",
        value: "#010203",
      },
    );
    expect(changed.status).toBe(200);
    expect(changed.body?.primaryColor).toBe("#010203");

    const stale = await fixture.managementPut(
      `${path}/default`,
      actor.auth.accessToken,
      {
        expectedUpdatedAt,
        setting: "brandPrimaryColor",
        value: "#112233",
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "CONFIGURATION_CONFLICT" });

    const invalid = await fixture.managementPut(
      `${path}/default`,
      actor.auth.accessToken,
      {
        expectedUpdatedAt: String(changed.body?.updatedAt),
        setting: "brandPrimaryColor",
        value: "#abc",
      },
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ code: "REQUEST_INVALID" });
  });

  it("preserves the R02 concurrent exact-Location analytics repair", async () => {
    const actor = await passwordOnlyAdmin();
    const location = await fixture.addLocation(actor.membership.organizationId);
    const base =
      `/v1/staff/dashboard/locations/${location.locationId}/analytics`;
    const query = "from=2026-09-16&to=2026-09-16";
    expect((await fixture.factors(actor.user.id)).rowCount).toBe(0);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const responses = await Promise.all(
        [
          `/v1/staff/dashboard/locations/${location.locationId}/overview/session-state-counts`,
          `${base}/queue`,
          `${base}/operations?${query}`,
          `${base}/incidents?${query}`,
          `${base}/kpis?${query}`,
        ].map((path) => fixture.managementGet(path, actor.auth.accessToken)),
      );
      expect(responses.map((response) => response.status)).toEqual([
        200, 200, 200, 200, 200,
      ]);
    }
  });
});
