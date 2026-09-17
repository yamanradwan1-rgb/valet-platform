import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function locationsPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations`;
}

function lifecyclePath(organizationId: string, locationId: string) {
  return `${locationsPath(organizationId)}/${locationId}`;
}

function createBody(operationId = randomUUID()) {
  return {
    addressText: "King Abdullah II Street",
    code: `LOC-${randomUUID().slice(0, 8)}`,
    currency: "JOD",
    name: "Lifecycle Location",
    operationId,
    timezone: "Asia/Amman",
  };
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    name: "Location lifecycle org",
  });
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
  return { auth, factor, membership, user };
}

async function createLocation(
  organizationId: string,
  accessToken: string,
  body = createBody(),
) {
  const result = await fixture.managementPost(
    locationsPath(organizationId),
    accessToken,
    body,
  );
  expect(result.status).toBe(201);
  return { body, result };
}

describe("MGT-BE-07 Management Location creation", () => {
  it("creates INACTIVE with closed intake and converges exact idempotent retries to one audit", async () => {
    const admin = await assuredAdmin();
    const operationId = randomUUID();
    const body = createBody(operationId);
    const first = await createLocation(
      admin.membership.organizationId,
      admin.auth.accessToken,
      body,
    );

    expect(first.result.body).toMatchObject({
      acceptingIntake: false,
      addressText: body.addressText,
      code: body.code,
      currency: "JOD",
      name: body.name,
      organizationId: admin.membership.organizationId,
      readiness: {
        checks: { currencySupported: true, timezoneValid: true },
        readyForActivation: true,
      },
      status: "INACTIVE",
      timezone: "Asia/Amman",
    });

    const retry = await fixture.managementPost(
      locationsPath(admin.membership.organizationId),
      admin.auth.accessToken,
      body,
    );
    expect(retry.status).toBe(201);
    expect(retry.body?.locationId).toBe(first.result.body?.locationId);
    expect(retry.body?.updatedAt).toBe(first.result.body?.updatedAt);

    const audits = await fixture.query<{
      actor_membership_id: string;
      count: string;
      location_id: string;
    }>(
      `SELECT min(actor_membership_id::text) AS actor_membership_id,
              min(location_id::text) AS location_id,
              count(*)::text AS count
       FROM audit_events
       WHERE organization_id=$1 AND event_type='LOCATION_CREATED'
         AND idempotency_key=$2`,
      [admin.membership.organizationId, operationId],
    );
    expect(audits.rows[0]).toMatchObject({
      actor_membership_id: admin.membership.membershipId,
      count: "1",
      location_id: first.result.body?.locationId,
    });

    const conflict = await fixture.managementPost(
      locationsPath(admin.membership.organizationId),
      admin.auth.accessToken,
      { ...body, name: "Different desired location" },
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("requires authentication, Company Admin authority, and five-minute MFA freshness", async () => {
    const adminUser = await fixture.createUser();
    const admin = await fixture.createMembership(adminUser.id);
    const adminAuth = await fixture.nativeLogin(adminUser);
    const path = locationsPath(admin.organizationId);

    const anonymous = await fixture.request(path, { body: createBody() });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toMatchObject({
      code: "STAFF_AUTHENTICATION_REQUIRED",
    });

    const noMfa = await fixture.managementPost(
      path,
      adminAuth.accessToken,
      createBody(),
    );
    expect(noMfa.status).toBe(403);
    expect(noMfa.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });

    await fixture.enrollAndAssure(adminAuth);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [adminAuth.sessionId],
    );
    const stale = await fixture.managementPost(
      path,
      adminAuth.accessToken,
      createBody(),
    );
    expect(stale.status).toBe(403);
    expect(stale.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });

    const managerUser = await fixture.createUser();
    const manager = await fixture.createMembership(managerUser.id, {
      role: "LOCATION_MANAGER",
    });
    const managerAuth = await fixture.nativeLogin(managerUser);
    const denied = await fixture.managementPost(
      locationsPath(manager.organizationId),
      managerAuth.accessToken,
      createBody(),
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});

describe("MGT-BE-07 Management Location lifecycle", () => {
  it("activates, fences intake, enforces CAS and drain, deactivates, audits, and remains historically readable", async () => {
    const admin = await assuredAdmin();
    const created = await createLocation(
      admin.membership.organizationId,
      admin.auth.accessToken,
    );
    const locationId = String(created.result.body?.locationId);
    const base = lifecyclePath(admin.membership.organizationId, locationId);
    const createdAt = String(created.result.body?.updatedAt);

    const activated = await fixture.managementPost(
      `${base}/activate`,
      admin.auth.accessToken,
      { expectedUpdatedAt: createdAt },
    );
    expect(activated.status).toBe(201);
    expect(activated.body).toMatchObject({
      acceptingIntake: true,
      status: "ACTIVE",
    });

    const staleStop = await fixture.managementPost(
      `${base}/stop-intake`,
      admin.auth.accessToken,
      { expectedUpdatedAt: createdAt },
    );
    expect(staleStop.status).toBe(409);
    expect(staleStop.body).toMatchObject({
      code: "LOCATION_LIFECYCLE_CONFLICT",
    });

    const stopped = await fixture.managementPost(
      `${base}/stop-intake`,
      admin.auth.accessToken,
      { expectedUpdatedAt: String(activated.body?.updatedAt) },
    );
    expect(stopped.status).toBe(201);
    expect(stopped.body).toMatchObject({
      acceptingIntake: false,
      status: "ACTIVE",
    });

    const shiftId = await fixture.startActiveShift(
      admin.membership.organizationId,
      locationId,
      admin.membership.membershipId,
    );
    const blocked = await fixture.managementPost(
      `${base}/deactivate`,
      admin.auth.accessToken,
      { expectedUpdatedAt: String(stopped.body?.updatedAt) },
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "LOCATION_DRAIN_BLOCKED" });

    await fixture.endShift(shiftId);
    const deactivated = await fixture.managementPost(
      `${base}/deactivate`,
      admin.auth.accessToken,
      { expectedUpdatedAt: String(stopped.body?.updatedAt) },
    );
    expect(deactivated.status).toBe(201);
    expect(deactivated.body).toMatchObject({
      acceptingIntake: false,
      drain: { blocked: false },
      locationId,
      status: "INACTIVE",
    });

    const historical = await fixture.managementGet(
      `${base}/lifecycle`,
      admin.auth.accessToken,
    );
    expect(historical.status).toBe(200);
    expect(historical.body).toMatchObject({
      acceptingIntake: false,
      locationId,
      organizationId: admin.membership.organizationId,
      status: "INACTIVE",
    });

    const audits = await fixture.query<{
      actor_membership_id: string;
      event_type: string;
      location_id: string;
    }>(
      `SELECT actor_membership_id::text,event_type,location_id::text
       FROM audit_events
       WHERE organization_id=$1 AND location_id=$2
         AND event_type IN ('LOCATION_CREATED','LOCATION_ACTIVATED',
           'LOCATION_INTAKE_STOPPED','LOCATION_DEACTIVATED')
       ORDER BY occurred_at,id`,
      [admin.membership.organizationId, locationId],
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual([
      "LOCATION_CREATED",
      "LOCATION_ACTIVATED",
      "LOCATION_INTAKE_STOPPED",
      "LOCATION_DEACTIVATED",
    ]);
    expect(new Set(audits.rows.map((row) => row.actor_membership_id))).toEqual(
      new Set([admin.membership.membershipId]),
    );
    expect(new Set(audits.rows.map((row) => row.location_id))).toEqual(
      new Set([locationId]),
    );
  });
});
