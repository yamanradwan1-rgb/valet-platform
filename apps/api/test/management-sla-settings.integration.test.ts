import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

function companyPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/settings`;
}

function locationPath(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/settings`;
}

function command(setting: string, value: unknown, updatedAt: unknown) {
  return { expectedUpdatedAt: String(updatedAt), setting, value };
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
  return { auth, factor, location, membership, user };
}

describe("MGT-BE-10 Location SLA target Management setting", () => {
  it("is Location-only, nullable by default, strict, bounded, CAS-safe and audited once per real change", async () => {
    const context = await assuredAdmin();
    const path = locationPath(
      context.membership.organizationId,
      context.location.locationId,
    );
    const initial = await fixture.managementGet(path, context.auth.accessToken);
    expect(initial.status).toBe(200);
    expect((initial.body?.settings as Record<string, unknown>)?.slaTargetSeconds).toBeNull();

    const company = await fixture.managementGet(
      companyPath(context.membership.organizationId),
      context.auth.accessToken,
    );
    expect(company.status).toBe(200);
    expect(await fixture.managementPut(
      `${companyPath(context.membership.organizationId)}/default`,
      context.auth.accessToken,
      command("slaTargetSeconds", 300, company.body?.updatedAt),
    )).toMatchObject({ status: 400, body: { code: "REQUEST_INVALID" } });

    for (const value of [29, 3601]) {
      const rejected = await fixture.managementPut(
        `${path}/override`,
        context.auth.accessToken,
        command("slaTargetSeconds", value, initial.body?.updatedAt),
      );
      expect(rejected).toMatchObject({ status: 400, body: { code: "REQUEST_INVALID" } });
    }
    const extra = await fixture.managementPut(
      `${path}/override`,
      context.auth.accessToken,
      { ...command("slaTargetSeconds", 300, initial.body?.updatedAt), extra: true },
    );
    expect(extra).toMatchObject({ status: 400, body: { code: "REQUEST_INVALID" } });

    const lower = await fixture.managementPut(
      `${path}/override`,
      context.auth.accessToken,
      command("slaTargetSeconds", 30, initial.body?.updatedAt),
    );
    expect(lower.status).toBe(200);
    expect((lower.body?.settings as Record<string, unknown>)?.slaTargetSeconds).toBe(30);
    const upper = await fixture.managementPut(
      `${path}/override`,
      context.auth.accessToken,
      command("slaTargetSeconds", 3600, lower.body?.updatedAt),
    );
    expect(upper.status).toBe(200);
    expect((upper.body?.settings as Record<string, unknown>)?.slaTargetSeconds).toBe(3600);

    const auditBeforeRetry = await fixture.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events
       WHERE location_id=$1 AND event_type='MANAGEMENT_LOCATION_SLA_TARGET_CHANGED'`,
      [context.location.locationId],
    );
    const retry = await fixture.managementPut(
      `${path}/override`,
      context.auth.accessToken,
      command("slaTargetSeconds", 3600, initial.body?.updatedAt),
    );
    expect(retry.status).toBe(200);
    expect(retry.body?.updatedAt).toBe(upper.body?.updatedAt);
    const auditAfterRetry = await fixture.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events
       WHERE location_id=$1 AND event_type='MANAGEMENT_LOCATION_SLA_TARGET_CHANGED'`,
      [context.location.locationId],
    );
    expect(auditAfterRetry.rows[0]?.count).toBe(auditBeforeRetry.rows[0]?.count);

    const stale = await fixture.managementPut(
      `${path}/override`,
      context.auth.accessToken,
      command("slaTargetSeconds", 420, initial.body?.updatedAt),
    );
    expect(stale).toMatchObject({ status: 409, body: { code: "CONFIGURATION_CONFLICT" } });

    const cleared = await fixture.managementPost(
      `${path}/override/clear`,
      context.auth.accessToken,
      { expectedUpdatedAt: upper.body?.updatedAt, setting: "slaTargetSeconds" },
    );
    expect(cleared.status).toBe(201);
    expect((cleared.body?.settings as Record<string, unknown>)?.slaTargetSeconds).toBeNull();
    const audit = await fixture.query<{ event_type: string; metadata_json: Record<string, unknown> }>(
      `SELECT event_type,metadata_json FROM audit_events
       WHERE location_id=$1 AND event_type='MANAGEMENT_LOCATION_SLA_TARGET_CHANGED'
       ORDER BY occurred_at`,
      [context.location.locationId],
    );
    expect(audit.rows).toHaveLength(3);
    expect(audit.rows.map((row) => row.event_type)).toEqual([
      "MANAGEMENT_LOCATION_SLA_TARGET_CHANGED",
      "MANAGEMENT_LOCATION_SLA_TARGET_CHANGED",
      "MANAGEMENT_LOCATION_SLA_TARGET_CHANGED",
    ]);
    for (const row of audit.rows) {
      expect(Object.keys(row.metadata_json).sort()).toEqual([
        "newValue",
        "operation",
        "previousValue",
        "scope",
        "settingKey",
      ]);
      expect(JSON.stringify(row.metadata_json)).not.toMatch(
        /authorization|bearer|access.?token|password|secret|phone|contact|address/i,
      );
    }
    expect(audit.rows.at(-1)).toMatchObject({
      event_type: "MANAGEMENT_LOCATION_SLA_TARGET_CHANGED",
      metadata_json: { operation: "CLEAR", scope: "LOCATION_SETTING", settingKey: "slaTargetSeconds" },
    });
  });

  it("requires fresh SENSITIVE MFA and fails closed for foreign Location scope", async () => {
    const context = await assuredAdmin();
    const path = locationPath(context.membership.organizationId, context.location.locationId);
    const initial = await fixture.managementGet(path, context.auth.accessToken);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [context.auth.sessionId],
    );
    const staleMfa = await fixture.managementPut(
      `${path}/override`, context.auth.accessToken,
      command("slaTargetSeconds", 300, initial.body?.updatedAt),
    );
    expect(staleMfa).toMatchObject({ status: 403, body: { code: "MFA_STEP_UP_REQUIRED" } });
    expect((await fixture.stepUp(context.auth, context.factor.secret)).status).toBe(200);

    const foreignOrganization = await fixture.createOrganization();
    const foreignLocation = await fixture.addLocation(foreignOrganization);
    const foreign = await fixture.managementPut(
      `${locationPath(context.membership.organizationId, foreignLocation.locationId)}/override`,
      context.auth.accessToken,
      command("slaTargetSeconds", 300, initial.body?.updatedAt),
    );
    expect(foreign.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const foreignOrganizationWrite = await fixture.managementPut(
      `${locationPath(foreignOrganization, foreignLocation.locationId)}/override`,
      context.auth.accessToken,
      command("slaTargetSeconds", 300, initial.body?.updatedAt),
    );
    expect(foreignOrganizationWrite.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    const persisted = await fixture.query<{ sla_target_seconds: number | null }>(
      `SELECT sla_target_seconds FROM locations WHERE id=$1`, [foreignLocation.locationId],
    );
    expect(persisted.rows[0]?.sla_target_seconds).toBeNull();
  });
});
