import { createHash } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "../src/modules/management/management-authorization";
import { requireAuthorizedScope } from "../src/modules/dashboard/report-read-service";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    name: "Activity org",
  });
  const location = await fixture.addLocation(membership.organizationId, {
    name: "Activity location",
  });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership, user };
}

async function staffContext(
  userId: string,
  auth: { accessToken: string; sessionId: string },
): Promise<StaffSessionContext> {
  const created = await fixture.query<{ created_at: Date }>(
    `SELECT created_at FROM staff_auth_sessions WHERE id = $1`,
    [auth.sessionId],
  );
  return {
    accessTokenHash: `staff-access-sha256:v1:${createHash("sha256")
      .update(auth.accessToken)
      .digest("hex")}`,
    createdAt: created.rows[0]!.created_at,
    staffAuthSessionId: auth.sessionId,
    userId,
  };
}

async function setRecentAssurance(
  sessionId: string,
  mfaAge: string,
  activityAge: string,
) {
  await fixture.query(
    `UPDATE staff_auth_sessions
     SET created_at = clock_timestamp() - INTERVAL '2 hours',
         mfa_authenticated_at = clock_timestamp() - $2::interval,
         last_admin_activity_at = clock_timestamp() - $3::interval
     WHERE id = $1`,
    [sessionId, mfaAge, activityAge],
  );
}

describe("MGT-BE-03 Management activity and assurance", () => {
  it("records only successful Management use and never slides MFA authentication", async () => {
    const state = await assuredAdmin();
    await setRecentAssurance(state.auth.sessionId, "2 minutes", "1 minute");
    const before = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    const result = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/context?scopeKind=ALL_LOCATIONS`,
      state.auth.accessToken,
    );
    expect(result.status).toBe(200);
    const after = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
    expect(after.last_admin_activity_at!.getTime()).toBeGreaterThan(
      before.last_admin_activity_at!.getTime(),
    );
  });

  it("does not record activity for cross-tenant or missing target denial", async () => {
    const state = await assuredAdmin();
    const foreignOrg = await fixture.createOrganization({
      name: "Foreign org",
    });
    const foreign = await fixture.addLocation(foreignOrg, {
      name: "Foreign location",
    });
    const before = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    const result = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/context?scopeKind=LOCATION&locationId=${foreign.locationId}`,
      state.auth.accessToken,
    );
    expect(result.status).toBe(404);
    const after = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    expect(after.last_admin_activity_at).toEqual(before.last_admin_activity_at);
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
  });

  it("does not record activity when standard MFA is stale", async () => {
    const state = await assuredAdmin();
    await setRecentAssurance(state.auth.sessionId, "40 minutes", "30 minutes");
    const before = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    const result = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/context?scopeKind=ALL_LOCATIONS`,
      state.auth.accessToken,
    );
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    const after = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    expect(after.last_admin_activity_at).toEqual(before.last_admin_activity_at);
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
  });

  it("keeps report preflight non-qualifying for activity", async () => {
    const state = await assuredAdmin();
    await setRecentAssurance(state.auth.sessionId, "2 minutes", "1 minute");
    const context = await staffContext(state.user.id, state.auth);
    const before = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    const scope = await requireAuthorizedScope(
      fixture.databasePool(),
      state.user.id,
      state.location.locationId,
      context,
      "REPORT_EXPORT",
      false,
    );
    expect(scope.membershipId).toBe(state.membership.membershipId);
    const after = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    expect(after.last_admin_activity_at).toEqual(before.last_admin_activity_at);
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
  });

  it("supports the reusable sensitive assurance requirement without changing normal reads", async () => {
    const state = await assuredAdmin();
    const context = await staffContext(state.user.id, state.auth);
    await setRecentAssurance(
      state.auth.sessionId,
      "4 minutes 59 seconds",
      "1 minute",
    );
    await expect(
      inPostgresTransaction(fixture.databasePool(), (transaction) =>
        authorizeCompanyAdminManagement(transaction, context, {
          assurance: "SENSITIVE",
          capability: "STAFF_MANAGE_ELIGIBLE",
          organizationId: state.membership.organizationId,
        }),
      ),
    ).resolves.toMatchObject({ membershipId: state.membership.membershipId });

    await setRecentAssurance(
      state.auth.sessionId,
      "5 minutes 1 second",
      "1 minute",
    );
    await expect(
      inPostgresTransaction(fixture.databasePool(), (transaction) =>
        authorizeCompanyAdminManagement(transaction, context, {
          assurance: "SENSITIVE",
          capability: "STAFF_MANAGE_ELIGIBLE",
          organizationId: state.membership.organizationId,
        }),
      ),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });
});
