import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ManagementAlertMfaFixture } from "./management-alert-mfa-fixture";
import { seedAlertAggregateIncidentHistory } from "./management-alert-aggregate-perf-seed";

const fixture = new ManagementAlertMfaFixture();
const existing = {
  flag: process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED,
  cutover: process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER,
};
const preview = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/alerts/preview`;

beforeAll(async () => {
  process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED = "enabled";
  await fixture.start();
  const clock = await fixture.query<{ now: Date }>(
    "SELECT clock_timestamp()::timestamptz(3) AS now",
  );
  process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
    clock.rows[0]!.now.toISOString();
}, 180_000);

afterAll(async () => {
  try {
    await fixture.stop();
  } finally {
    for (const [key, old] of [
      ["MANAGEMENT_ALERTS_PHASE1_ENABLED", existing.flag],
      ["MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER", existing.cutover],
    ] as const) {
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    }
  }
}, 120_000);

describe("Issue #414 Phase-1 mounted HTTP audience denial (PG17, MFA bypass OFF)", () => {
  it("denies CA after 30-minute admin inactivity without changing its clock", async () => {
    const admin = await fixture.createAssuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions SET
         created_at=clock_timestamp()-interval '1 hour',
         mfa_authenticated_at=clock_timestamp()-interval '40 minutes',
         last_admin_activity_at=clock_timestamp()-interval '31 minutes'
       WHERE id=$1`,
      [admin.auth.sessionId],
    );
    const before = (await fixture.sessionSnapshot(admin.auth.sessionId))
      .rows[0]!;
    const denied = await fixture.managementGet(
      preview(admin.location.locationId),
      admin.auth.accessToken,
    );
    expect(denied).toMatchObject({
      status: 403,
      body: { code: "MFA_STEP_UP_REQUIRED" },
    });
    expect(denied.body?.items).toBeUndefined();
    const after = (await fixture.sessionSnapshot(admin.auth.sessionId))
      .rows[0]!;
    expect(after.last_admin_activity_at).toEqual(before.last_admin_activity_at);
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
  });

  it("denies CA after eight-hour MFA assurance even with recent admin activity", async () => {
    const admin = await fixture.createAssuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions SET
         created_at=clock_timestamp()-interval '9 hours',
         mfa_authenticated_at=clock_timestamp()-interval '8 hours 1 second',
         last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [admin.auth.sessionId],
    );
    const denied = await fixture.managementGet(
      preview(admin.location.locationId),
      admin.auth.accessToken,
    );
    expect(denied.status).toBe(403);
    expect(denied.body?.code).toBe("MFA_STEP_UP_REQUIRED");
    expect(denied.body?.count).toBeUndefined();
  });

  it("rejects an LM rotated bearer and revoked Staff session despite an intact Location grant", async () => {
    const admin = await fixture.createAssuredAdmin();
    const manager = await fixture.createManager(
      admin.membership.organizationId,
    );
    await fixture.grantLocation(
      admin.membership.organizationId,
      manager.membershipId,
      admin.location.locationId,
    );
    const url = preview(admin.location.locationId);
    expect(
      (await fixture.managementGet(url, manager.auth.accessToken)).status,
    ).toBe(200);
    const rotated = await fixture.refresh(manager.auth.refreshToken);
    expect(rotated.status).toBe(200);
    const newToken = String(rotated.body?.accessToken);
    const stale = await fixture.managementGet(url, manager.auth.accessToken);
    expect(stale.status).not.toBe(200);
    expect(stale.body?.items).toBeUndefined();
    expect((await fixture.managementGet(url, newToken)).status).toBe(200);
    await fixture.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
      [manager.auth.sessionId],
    );
    const revoked = await fixture.managementGet(url, newToken);
    expect(revoked.status).not.toBe(200);
    expect(revoked.body?.items).toBeUndefined();
  });

  it("keeps authorized counts separate across tenants and rejects unentitled CA/Employee", async () => {
    const adminA = await fixture.createAssuredAdmin();
    const adminB = await fixture.createAssuredAdmin();
    await seedAlertAggregateIncidentHistory(fixture.databasePool(), {
      organizationId: adminB.membership.organizationId,
      locationId: adminB.location.locationId,
      reporterMembershipId: adminB.membership.membershipId,
      activeCount: 1,
      historicalCount: 0,
    });
    const ownA = await fixture.managementGet(
      preview(adminA.location.locationId),
      adminA.auth.accessToken,
    );
    const ownB = await fixture.managementGet(
      preview(adminB.location.locationId),
      adminB.auth.accessToken,
    );
    expect(ownA.body).toMatchObject({ count: 0, hasMore: false, items: [] });
    expect(ownB.body).toMatchObject({ count: 1, hasMore: false });
    const foreign = await fixture.managementGet(
      preview(adminB.location.locationId),
      adminA.auth.accessToken,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body?.count).toBeUndefined();

    const employee = await fixture.createUser();
    await fixture.addMembership(
      adminA.membership.organizationId,
      employee.id,
      "VALET_EMPLOYEE",
    );
    const employeeAuth = await fixture.nativeLogin(employee);
    const deniedEmployee = await fixture.managementGet(
      preview(adminA.location.locationId),
      employeeAuth.accessToken,
    );
    expect(deniedEmployee.status).toBe(404);
    expect(deniedEmployee.body?.count).toBeUndefined();

    await fixture.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled=FALSE WHERE organization_id=$1`,
      [adminA.membership.organizationId],
    );
    const unentitled = await fixture.managementGet(
      preview(adminA.location.locationId),
      adminA.auth.accessToken,
    );
    expect(unentitled.status).toBe(404);
    expect(unentitled.body?.count).toBeUndefined();
  });
});
