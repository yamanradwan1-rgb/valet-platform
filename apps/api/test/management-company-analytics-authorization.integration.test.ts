import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name: "BE-11 auth" });
  await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership, user };
}

function analyticsPath(organizationId: string, query = "from=2026-07-10&to=2026-07-10") {
  return `/v1/staff/management/organizations/${organizationId}/analytics/all-locations?${query}`;
}

async function loggedInNonAdmin(organizationId: string) {
  const user = await fixture.createUser();
  const membershipId = await fixture.addMembership(organizationId, user.id, "LOCATION_MANAGER");
  const auth = await fixture.nativeLogin(user);
  return { auth, membershipId };
}

async function selectedAdmin() {
  const state = await assuredAdmin();
  const selected = await fixture.managementGet(
    `/v1/staff/management/organizations/${state.membership.organizationId}/context?scopeKind=ALL_LOCATIONS`,
    state.auth.accessToken,
  );
  expect(selected.status).toBe(200);
  return state;
}

async function expectCachedDenied(
  mutate: (state: Awaited<ReturnType<typeof assuredAdmin>>) => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
) {
  const state = await selectedAdmin();
  await mutate(state);
  const denied = await fixture.managementGet(
    analyticsPath(state.membership.organizationId),
    state.auth.accessToken,
  );
  expect(denied.status).toBe(expectedStatus);
  expect(denied.body).toMatchObject({ code: expectedCode });
}

describe("MGT-BE-11 company analytics HTTP authorization", () => {
  it("allows the assured Company Admin, records activity once and writes no audit", async () => {
    const state = await assuredAdmin();
    const beforeSession = (await fixture.sessionSnapshot(state.auth.sessionId)).rows[0]!;
    const beforeAudit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE organization_id=$1`,
      [state.membership.organizationId],
    );
    const response = await fixture.managementGet(
      analyticsPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.body).toMatchObject({ organizationId: state.membership.organizationId });
    const afterSession = (await fixture.sessionSnapshot(state.auth.sessionId)).rows[0]!;
    expect(afterSession.mfa_authenticated_at).toEqual(beforeSession.mfa_authenticated_at);
    expect(afterSession.last_admin_activity_at!.getTime()).toBeGreaterThanOrEqual(
      beforeSession.last_admin_activity_at!.getTime(),
    );
    const afterAudit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE organization_id=$1`,
      [state.membership.organizationId],
    );
    expect(afterAudit.rows[0]?.count).toBe(beforeAudit.rows[0]?.count);
  });

  it("requires MFA on the exact Staff session", async () => {
    const state = await assuredAdmin();
    const secondSession = await fixture.nativeLogin(state.user);
    const noMfa = await fixture.managementGet(
      analyticsPath(state.membership.organizationId),
      secondSession.accessToken,
    );
    expect(noMfa.status).toBe(403);
    expect(noMfa.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });

  it("denies LOCATION_MANAGER, supervisor and employee roles non-disclosingly", async () => {
    const organizationId = await fixture.createOrganization({ name: "Role denial" });
    const actor = await loggedInNonAdmin(organizationId);
    for (const role of ["LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const) {
      await fixture.query(
        `UPDATE organization_memberships SET role=$2,updated_at=clock_timestamp() WHERE id=$1`,
        [actor.membershipId, role],
      );
      const denied = await fixture.managementGet(
        analyticsPath(organizationId),
        actor.auth.accessToken,
      );
      expect(denied.status, role).toBe(404);
      expect(denied.body, role).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
  });

  it("requires Staff authentication for the company analytics route", async () => {
    const organizationId = await fixture.createOrganization({ name: "No staff auth" });
    const path = analyticsPath(organizationId);
    const missing = await fixture.request(path, {
      method: "GET",
    });
    expect(missing.status).toBe(401);
    expect(missing.body).toMatchObject({ code: "STAFF_AUTHENTICATION_REQUIRED" });
    const guestStyle = await fixture.request(path, {
      authorization: "Bearer guest-token",
      method: "GET",
    });
    expect(guestStyle.status).toBe(401);
    expect(guestStyle.body).toMatchObject({ code: "STAFF_AUTHENTICATION_REQUIRED" });
  });

  it("requires step-up again when STANDARD assurance has gone stale", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '40 minutes',
           last_admin_activity_at=clock_timestamp()-interval '30 minutes'
       WHERE id=$1`,
      [state.auth.sessionId],
    );
    const stale = await fixture.managementGet(
      analyticsPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(stale.status).toBe(403);
    expect(stale.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect((await fixture.sessionSnapshot(state.auth.sessionId)).rows[0]?.revoked_at).toBeNull();
  });

  it("revalidates Organization scope and exact Staff session", async () => {
    const state = await assuredAdmin();
    const foreignOrganizationId = await fixture.createOrganization({ name: "Foreign" });
    const foreign = await fixture.managementGet(
      analyticsPath(foreignOrganizationId),
      state.auth.accessToken,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await fixture.query(
      `UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`,
      [state.auth.sessionId],
    );
    const revoked = await fixture.managementGet(
      analyticsPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(revoked.status).toBe(401);
    expect(revoked.body).toMatchObject({ code: "STAFF_AUTHENTICATION_REQUIRED" });
  });

  it("does not trust cached ALL_LOCATIONS after User disable", async () => {
    await expectCachedDenied(
      (state) => fixture.query(`UPDATE users SET status='DISABLED',updated_at=clock_timestamp() WHERE id=$1`, [state.user.id]),
      401,
      "STAFF_AUTHENTICATION_REQUIRED",
    );
  });

  it("does not trust cached ALL_LOCATIONS after membership deactivation", async () => {
    await expectCachedDenied(
      (state) => fixture.query(`UPDATE organization_memberships SET status='INACTIVE',updated_at=clock_timestamp() WHERE id=$1`, [state.membership.membershipId]),
      404,
      "AUTHORIZATION_DENIED",
    );
  });

  it("does not trust cached ALL_LOCATIONS after role reduction", async () => {
    await expectCachedDenied(
      (state) => fixture.query(`UPDATE organization_memberships SET role='LOCATION_MANAGER',updated_at=clock_timestamp() WHERE id=$1`, [state.membership.membershipId]),
      404,
      "AUTHORIZATION_DENIED",
    );
  });

  it("does not trust cached ALL_LOCATIONS after Organization deactivation", async () => {
    await expectCachedDenied(
      (state) => fixture.query(`UPDATE organizations SET status='INACTIVE',updated_at=clock_timestamp() WHERE id=$1`, [state.membership.organizationId]),
      404,
      "AUTHORIZATION_DENIED",
    );
  });

  it("rejects malformed Organization ids and strict invalid periods", async () => {
    const state = await assuredAdmin();
    const attempts = [
      analyticsPath("not-a-uuid"),
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations`,
      analyticsPath(state.membership.organizationId, "from=2026-07-10"),
      analyticsPath(state.membership.organizationId, "from=2026-07-12&to=2026-07-10"),
      analyticsPath(state.membership.organizationId, "from=2026-06-01&to=2026-07-02"),
      analyticsPath(
        state.membership.organizationId,
        "from=2026-07-10&to=2026-07-10&timezone=UTC",
      ),
    ];
    for (const path of attempts) {
      const response = await fixture.managementGet(path, state.auth.accessToken);
      expect(response.status, path).toBe(400);
      expect(response.body, path).toMatchObject({ code: "REQUEST_INVALID" });
    }
  });
});
