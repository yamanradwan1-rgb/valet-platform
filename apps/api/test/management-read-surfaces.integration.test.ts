import { createHash } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { generateReportExport } from "../src/modules/dashboard/report-export-service";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    name: "Read surface org",
  });
  const location = await fixture.addLocation(membership.organizationId, {
    name: "Read surface location",
  });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership, user };
}

async function sessionContext(
  userId: string,
  auth: { accessToken: string; sessionId: string },
): Promise<StaffSessionContext> {
  const row = await fixture.query<{ created_at: Date }>(
    `SELECT created_at FROM staff_auth_sessions WHERE id = $1`,
    [auth.sessionId],
  );
  return {
    accessTokenHash: `staff-access-sha256:v1:${createHash("sha256")
      .update(auth.accessToken)
      .digest("hex")}`,
    createdAt: row.rows[0]!.created_at,
    staffAuthSessionId: auth.sessionId,
    userId,
  };
}

describe("MGT-BE-03 Company Admin existing read surfaces", () => {
  it("reads Overview, Analytics, Reports and live map without a Location grant", async () => {
    const state = await assuredAdmin();
    const accessCount = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM membership_location_access
       WHERE membership_id = $1`,
      [state.membership.membershipId],
    );
    expect(accessCount.rows[0]?.count).toBe("0");
    const before = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;

    const paths = [
      `/v1/staff/dashboard/locations/${state.location.locationId}/overview/session-state-counts`,
      `/v1/staff/dashboard/locations/${state.location.locationId}/analytics/queue`,
      `/v1/staff/dashboard/locations/${state.location.locationId}/analytics/kpis?from=2026-09-16&to=2026-09-16`,
      `/v1/staff/dashboard/locations/${state.location.locationId}/reports/daily?date=2026-09-16`,
      `/v1/staff/locations/${state.location.locationId}/live-operations-map`,
    ];
    for (const path of paths) {
      expect(
        (await fixture.managementGet(path, state.auth.accessToken)).status,
      ).toBe(200);
    }

    const after = (await fixture.sessionSnapshot(state.auth.sessionId))
      .rows[0]!;
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
    expect(after.mfa_factor_id).toBe(before.mfa_factor_id);
    expect(after.last_admin_activity_at!.getTime()).toBeGreaterThanOrEqual(
      before.last_admin_activity_at!.getTime(),
    );
  });

  it("audits a report export with the exact ORG_ADMIN membership", async () => {
    const state = await assuredAdmin();
    const result = await generateReportExport(fixture.databasePool(), {
      authenticatedUserId: state.user.id,
      locationId: state.location.locationId,
      request: { date: "2026-09-16", format: "CSV", kind: "DAILY" },
      staffSessionContext: await sessionContext(state.user.id, state.auth),
    });
    expect(result.bytes.byteLength).toBeGreaterThan(0);

    const audit = await fixture.query<{
      actor_membership_id: string | null;
      actor_type: string | null;
      event_type: string;
      location_id: string | null;
      organization_id: string;
    }>(
      `SELECT actor_membership_id::text, actor_type::text, event_type,
              location_id::text, organization_id::text
       FROM audit_events WHERE organization_id = $1`,
      [state.membership.organizationId],
    );
    expect(audit.rows).toEqual([
      {
        actor_membership_id: state.membership.membershipId,
        actor_type: "MEMBERSHIP",
        event_type: "DASHBOARD_REPORT_EXPORT_GENERATED",
        location_id: state.location.locationId,
        organization_id: state.membership.organizationId,
      },
    ]);
  });

  it("soft-step-ups Dashboard and live-map reads without revoking the session", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at = clock_timestamp() - INTERVAL '2 hours',
           mfa_authenticated_at = clock_timestamp() - INTERVAL '1 hour',
           last_admin_activity_at = clock_timestamp() - INTERVAL '30 minutes'
       WHERE id = $1`,
      [state.auth.sessionId],
    );
    for (const path of [
      `/v1/staff/dashboard/locations/${state.location.locationId}/overview/session-state-counts`,
      `/v1/staff/locations/${state.location.locationId}/live-operations-map`,
    ]) {
      const result = await fixture.managementGet(path, state.auth.accessToken);
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    }
    expect(
      (await fixture.sessionSnapshot(state.auth.sessionId)).rows[0]?.revoked_at,
    ).toBeNull();
  });

  it("preserves Location Manager Dashboard access without Company Admin MFA", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id, {
      name: "Manager compatibility",
      role: "LOCATION_MANAGER",
    });
    const location = await fixture.addLocation(membership.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [membership.organizationId, membership.membershipId, location.locationId],
    );
    const auth = await fixture.nativeLogin(user);
    const result = await fixture.managementGet(
      `/v1/staff/dashboard/locations/${location.locationId}/overview/session-state-counts`,
      auth.accessToken,
    );
    expect(result.status).toBe(200);
  });
});
