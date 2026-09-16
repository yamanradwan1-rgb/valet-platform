import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function allLocationsContext(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/context?scopeKind=ALL_LOCATIONS`;
}

function locationContext(organizationId: string, locationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/context?scopeKind=LOCATION&locationId=${locationId}`;
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    name: "Staleness org",
  });
  const location = await fixture.addLocation(membership.organizationId, {
    name: "Staleness location",
  });
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
  const path = allLocationsContext(membership.organizationId);
  const initial = await fixture.managementGet(path, auth.accessToken);
  expect(initial.status).toBe(200);
  return { auth, factor, location, membership, path, user };
}

describe("MGT-BE-03 Management authority revalidation", () => {
  it("rejects a Location from another Organization even for a two-org admin", async () => {
    const user = await fixture.createUser();
    const first = await fixture.createMembership(user.id, { name: "Target A" });
    const second = await fixture.createMembership(user.id, {
      name: "Target B",
    });
    const foreign = await fixture.addLocation(second.organizationId, {
      name: "Foreign target",
    });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const result = await fixture.managementGet(
      locationContext(first.organizationId, foreign.locationId),
      auth.accessToken,
    );
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("revalidates membership status after a successful context snapshot", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE organization_memberships SET status = 'INACTIVE',
              updated_at = transaction_timestamp()
       WHERE id = $1`,
      [state.membership.membershipId],
    );

    const result = await fixture.managementGet(
      state.path,
      state.auth.accessToken,
    );
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("revalidates role after a successful context snapshot", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE organization_memberships SET role = 'LOCATION_MANAGER',
              updated_at = transaction_timestamp()
       WHERE id = $1`,
      [state.membership.membershipId],
    );

    const result = await fixture.managementGet(
      state.path,
      state.auth.accessToken,
    );
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("revalidates Organization status after a successful context snapshot", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE organizations SET status = 'INACTIVE',
              updated_at = transaction_timestamp()
       WHERE id = $1`,
      [state.membership.organizationId],
    );

    const result = await fixture.managementGet(
      state.path,
      state.auth.accessToken,
    );
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("revalidates User status after a successful context snapshot", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE users SET status = 'DISABLED', updated_at = transaction_timestamp()
       WHERE id = $1`,
      [state.user.id],
    );

    const result = await fixture.managementGet(
      state.path,
      state.auth.accessToken,
    );
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({
      code: "STAFF_AUTHENTICATION_REQUIRED",
    });
  });

  it("revalidates Staff session revocation after a successful context snapshot", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions SET revoked_at = clock_timestamp()
       WHERE id = $1`,
      [state.auth.sessionId],
    );

    const result = await fixture.managementGet(
      state.path,
      state.auth.accessToken,
    );
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({
      code: "STAFF_AUTHENTICATION_REQUIRED",
    });
  });

  it("revalidates the exact active MFA factor after a successful context snapshot", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE user_mfa_totp_factors
       SET state = 'RETIRED', retired_at = clock_timestamp()
       WHERE id = $1`,
      [state.factor.factorId],
    );

    const result = await fixture.managementGet(
      state.path,
      state.auth.accessToken,
    );
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });

  it("requires step-up at the eight-hour MFA maximum without revoking the session", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at = clock_timestamp() - INTERVAL '9 hours',
           mfa_authenticated_at = clock_timestamp() - INTERVAL '8 hours',
           last_admin_activity_at = clock_timestamp() - INTERVAL '1 minute'
       WHERE id = $1`,
      [state.auth.sessionId],
    );

    const result = await fixture.managementGet(
      state.path,
      state.auth.accessToken,
    );
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    const session = await fixture.sessionSnapshot(state.auth.sessionId);
    expect(session.rows[0]?.revoked_at).toBeNull();
  });

  it("requires step-up at thirty minutes of admin inactivity", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at = clock_timestamp() - INTERVAL '1 hour',
           mfa_authenticated_at = clock_timestamp() - INTERVAL '40 minutes',
           last_admin_activity_at = clock_timestamp() - INTERVAL '30 minutes'
       WHERE id = $1`,
      [state.auth.sessionId],
    );

    const result = await fixture.managementGet(
      state.path,
      state.auth.accessToken,
    );
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });
});
