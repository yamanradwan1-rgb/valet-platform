import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  managementAlertTimingPreferenceDefaults as defaults,
  type ManagementAlertTimingPreferenceValues,
} from "@valet/contracts";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function path(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/alert-timing-preferences`;
}

async function admin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return {
    ...membership,
    ...location,
    user,
    auth,
    route: path(membership.organizationId, location.locationId),
  };
}

async function auditCount(organizationId: string) {
  const result = await fixture.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM audit_events
     WHERE organization_id=$1 AND event_type='MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED'`,
    [organizationId],
  );
  return result.rows[0]?.count ?? -1;
}

function saveActor(
  actor: Awaited<ReturnType<typeof admin>>,
  values: ManagementAlertTimingPreferenceValues,
  expectedRevision: number,
) {
  return fixture.managementPut(actor.route, actor.auth.accessToken, {
    expectedRevision,
    values,
  });
}

describe("Issue #414 personal alert timing API (real PostgreSQL, bypass off)", () => {
  it("returns effective zero-row defaults, persists changed preference, and converges retries", async () => {
    const actor = await admin();
    const initial = await fixture.managementGet(
      actor.route,
      actor.auth.accessToken,
    );
    expect(initial.status).toBe(200);
    expect(initial.headers.get("cache-control")).toContain("no-store");
    expect(initial.body).toMatchObject({
      organizationId: actor.organizationId,
      userId: actor.user.id,
      revision: 0,
      updatedAt: null,
      values: defaults,
    });
    const missing = await fixture.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM management_alert_timing_preferences
       WHERE organization_id=$1 AND user_id=$2`,
      [actor.organizationId, actor.user.id],
    );
    expect(missing.rows[0]?.n).toBe(0);
    const noOp = await saveActor(actor, defaults, 0);
    expect(noOp.body).toMatchObject({ revision: 0, updatedAt: null });
    expect(await auditCount(actor.organizationId)).toBe(0);

    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '2 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [actor.auth.sessionId],
    );
    const values = { ...defaults, alt02QueueSeconds: 75 };
    const first = await saveActor(actor, values, 0);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ revision: 1, values });
    const activity = (await fixture.sessionSnapshot(actor.auth.sessionId))
      .rows[0]!;
    expect(activity.last_admin_activity_at!.getTime()).toBeGreaterThan(
      Date.now() - 40_000,
    );
    const retry = await saveActor(actor, values, 0);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(await auditCount(actor.organizationId)).toBe(1);
    const audit = await fixture.query<{
      actor_membership_id: string;
      entity_type: string;
      entity_id: string;
      location_id: string | null;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT actor_membership_id::text, entity_type, entity_id::text,
         location_id::text, metadata_json FROM audit_events
       WHERE organization_id=$1
         AND event_type='MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED'`,
      [actor.organizationId],
    );
    expect(audit.rows[0]).toEqual({
      actor_membership_id: actor.membershipId,
      entity_type: "User",
      entity_id: actor.user.id,
      location_id: null,
      metadata_json: {
        changedKeys: "alt02QueueSeconds",
        beforeRevision: 0,
        afterRevision: 1,
      },
    });
    const changed = await saveActor(
      actor,
      { ...values, alt03DeclineSeconds: 10 },
      1,
    );
    expect(changed.body).toMatchObject({ revision: 2 });
    expect(await auditCount(actor.organizationId)).toBe(2);
    const stale = await saveActor(
      actor,
      { ...values, alt04StageSeconds: 400 },
      1,
    );
    expect(stale.status).toBe(409);
    expect(stale.body?.code).toBe("VERSION_CONFLICT");
    expect(await auditCount(actor.organizationId)).toBe(2);
  });

  it("rejects tampered values, cross-tenant targets and ineligible role without writes", async () => {
    const actor = await admin();
    const other = await admin();
    const invalid = await saveActor(
      actor,
      { ...defaults, alt01GraceSeconds: 61 },
      0,
    );
    expect(invalid.status).toBe(400);
    const foreign = await fixture.managementGet(
      other.route,
      actor.auth.accessToken,
    );
    expect(foreign.status).toBe(404);
    const foreignPut = await fixture.managementPut(
      other.route,
      actor.auth.accessToken,
      {
        expectedRevision: 0,
        values: { ...defaults, alt02QueueSeconds: 75 },
      },
    );
    expect(foreignPut.status).toBe(404);
    const supervisorUser = await fixture.createUser();
    await fixture.addMembership(
      actor.organizationId,
      supervisorUser.id,
      "VALET_SUPERVISOR",
    );
    const supervisorAuth = await fixture.nativeLogin(supervisorUser);
    expect(
      (await fixture.managementGet(actor.route, supervisorAuth.accessToken))
        .status,
    ).toBe(404);
    expect(await auditCount(actor.organizationId)).toBe(0);
    expect(await auditCount(other.organizationId)).toBe(0);
  });

  it("keeps CA GET activity-neutral and enforces 5-minute MFA for changed PUT", async () => {
    const actor = await admin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [actor.auth.sessionId],
    );
    const before = (await fixture.sessionSnapshot(actor.auth.sessionId))
      .rows[0]!;
    const read = await fixture.managementGet(
      actor.route,
      actor.auth.accessToken,
    );
    expect(read.status).toBe(200);
    const after = (await fixture.sessionSnapshot(actor.auth.sessionId))
      .rows[0]!;
    expect(after.last_admin_activity_at).toEqual(before.last_admin_activity_at);
    const save = await fixture.managementPut(
      actor.route,
      actor.auth.accessToken,
      {
        expectedRevision: 0,
        values: { ...defaults, alt02QueueSeconds: 75 },
      },
    );
    expect(save.status).toBe(403);
    expect(save.body?.code).toBe("MFA_STEP_UP_REQUIRED");
    expect(await auditCount(actor.organizationId)).toBe(0);
  });

  it("enforces active LM exact Location grant and preserves each User's own preferences", async () => {
    const actor = await admin();
    const lm = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.organizationId,
      lm.id,
      "LOCATION_MANAGER",
    );
    const lmAuth = await fixture.nativeLogin(lm);
    expect(
      (await fixture.managementGet(actor.route, lmAuth.accessToken)).status,
    ).toBe(404);
    await fixture.query(
      `INSERT INTO membership_location_access
         (organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [actor.organizationId, membershipId, actor.locationId],
    );
    const own = await fixture.managementGet(actor.route, lmAuth.accessToken);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({
      userId: lm.id,
      revision: 0,
      values: defaults,
    });
    const saved = await fixture.managementPut(actor.route, lmAuth.accessToken, {
      expectedRevision: 0,
      values: { ...defaults, alt03DeclineSeconds: 15 },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ userId: lm.id, revision: 1 });
    const secondLocation = await fixture.addLocation(actor.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access
         (organization_id,membership_id,location_id) VALUES($1,$2,$3)`,
      [actor.organizationId, membershipId, secondLocation.locationId],
    );
    const secondRoute = path(actor.organizationId, secondLocation.locationId);
    const secondRead = await fixture.managementGet(
      secondRoute,
      lmAuth.accessToken,
    );
    expect(secondRead.body).toMatchObject({
      userId: lm.id,
      revision: 1,
      values: { ...defaults, alt03DeclineSeconds: 15 },
    });
    const adminRead = await fixture.managementGet(
      actor.route,
      actor.auth.accessToken,
    );
    expect(adminRead.body).toMatchObject({
      userId: actor.user.id,
      revision: 0,
      values: defaults,
    });
    await fixture.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1`,
      [membershipId],
    );
    expect(
      (await fixture.managementGet(actor.route, lmAuth.accessToken)).status,
    ).toBe(404);
    expect(
      (
        await fixture.managementPut(actor.route, lmAuth.accessToken, {
          expectedRevision: 1,
          values: { ...defaults, alt03DeclineSeconds: 30 },
        })
      ).status,
    ).toBe(404);
    expect(await auditCount(actor.organizationId)).toBe(1);
  });
});
