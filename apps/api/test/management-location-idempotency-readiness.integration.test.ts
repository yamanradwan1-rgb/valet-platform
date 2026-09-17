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

function createBody(code = `LOC-${randomUUID().slice(0, 8)}`) {
  return {
    addressText: "Idempotency readiness address",
    code,
    currency: "JOD",
    name: "Idempotency readiness location",
    operationId: randomUUID(),
    timezone: "Asia/Amman",
  };
}

async function assuredAdmin(name: string) {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
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
  return result;
}

describe("MGT-BE-07 Location create convergence and readiness", () => {
  it("serializes duplicate codes per Organization while keeping the code tenant-scoped", async () => {
    const firstAdmin = await assuredAdmin("Duplicate code org A");
    const secondAdmin = await assuredAdmin("Duplicate code org B");
    const code = `DUP-${randomUUID().slice(0, 8)}`;
    const requests = [createBody(code), createBody(code)];

    const attempts = await Promise.all(
      requests.map((body) =>
        fixture.managementPost(
          locationsPath(firstAdmin.membership.organizationId),
          firstAdmin.auth.accessToken,
          body,
        ),
      ),
    );
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      attempts.find((attempt) => attempt.status === 409)?.body,
    ).toMatchObject({
      code: "LOCATION_CODE_CONFLICT",
    });

    const persisted = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM locations
       WHERE organization_id=$1 AND code=$2`,
      [firstAdmin.membership.organizationId, code],
    );
    expect(persisted.rows[0]?.count).toBe("1");

    const sameCodeOtherTenant = await fixture.managementPost(
      locationsPath(secondAdmin.membership.organizationId),
      secondAdmin.auth.accessToken,
      createBody(code),
    );
    expect(sameCodeOtherTenant.status).toBe(201);
  });

  it("rejects unsupported create configuration before persistence", async () => {
    const admin = await assuredAdmin("Invalid create config org");
    for (const body of [
      { ...createBody(), currency: "ZZZ" },
      { ...createBody(), timezone: "Mars/Olympus" },
    ]) {
      const result = await fixture.managementPost(
        locationsPath(admin.membership.organizationId),
        admin.auth.accessToken,
        body,
      );
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({
        code: "CONFIGURATION_VALUE_INVALID",
      });
    }
    const rows = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM locations WHERE organization_id=$1`,
      [admin.membership.organizationId],
    );
    expect(rows.rows[0]?.count).toBe("0");
  });

  it("reports legacy invalid readiness and refuses activation without an audit", async () => {
    const admin = await assuredAdmin("Legacy readiness org");
    const created = await createLocation(
      admin.membership.organizationId,
      admin.auth.accessToken,
    );
    const locationId = String(created.body?.locationId);
    await fixture.query(
      `UPDATE locations SET timezone='Mars/Olympus' WHERE id=$1`,
      [locationId],
    );

    const lifecycle = await fixture.managementGet(
      `${locationsPath(admin.membership.organizationId)}/${locationId}/lifecycle`,
      admin.auth.accessToken,
    );
    expect(lifecycle.status).toBe(200);
    expect(lifecycle.body?.readiness).toEqual({
      checks: { currencySupported: true, timezoneValid: false },
      readyForActivation: false,
    });

    const activation = await fixture.managementPost(
      `${locationsPath(admin.membership.organizationId)}/${locationId}/activate`,
      admin.auth.accessToken,
      { expectedUpdatedAt: String(created.body?.updatedAt) },
    );
    expect(activation.status).toBe(409);
    expect(activation.body).toMatchObject({ code: "LOCATION_NOT_READY" });
    const audits = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE location_id=$1 AND event_type='LOCATION_ACTIVATED'`,
      [locationId],
    );
    expect(audits.rows[0]?.count).toBe("0");
  });

  it("converges lifecycle desired-state retries without new timestamps or audits", async () => {
    const admin = await assuredAdmin("Desired state retry org");
    const created = await createLocation(
      admin.membership.organizationId,
      admin.auth.accessToken,
    );
    const locationId = String(created.body?.locationId);
    const base = `${locationsPath(admin.membership.organizationId)}/${locationId}`;

    const activated = await fixture.managementPost(
      `${base}/activate`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: String(created.body?.updatedAt),
      },
    );
    const activateRetry = await fixture.managementPost(
      `${base}/activate`,
      admin.auth.accessToken,
      { expectedUpdatedAt: String(created.body?.updatedAt) },
    );
    expect(activateRetry.status).toBe(201);
    expect(activateRetry.body?.updatedAt).toBe(activated.body?.updatedAt);

    const stopped = await fixture.managementPost(
      `${base}/stop-intake`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: String(activated.body?.updatedAt),
      },
    );
    const stopRetry = await fixture.managementPost(
      `${base}/stop-intake`,
      admin.auth.accessToken,
      { expectedUpdatedAt: String(activated.body?.updatedAt) },
    );
    expect(stopRetry.status).toBe(201);
    expect(stopRetry.body?.updatedAt).toBe(stopped.body?.updatedAt);

    const deactivated = await fixture.managementPost(
      `${base}/deactivate`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: String(stopped.body?.updatedAt),
      },
    );
    const deactivateRetry = await fixture.managementPost(
      `${base}/deactivate`,
      admin.auth.accessToken,
      { expectedUpdatedAt: String(stopped.body?.updatedAt) },
    );
    expect(deactivateRetry.status).toBe(201);
    expect(deactivateRetry.body?.updatedAt).toBe(deactivated.body?.updatedAt);

    const audits = await fixture.query<{ event_type: string }>(
      `SELECT event_type FROM audit_events
       WHERE location_id=$1 AND event_type IN (
         'LOCATION_ACTIVATED','LOCATION_INTAKE_STOPPED','LOCATION_DEACTIVATED')
       ORDER BY event_type`,
      [locationId],
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual([
      "LOCATION_ACTIVATED",
      "LOCATION_DEACTIVATED",
      "LOCATION_INTAKE_STOPPED",
    ]);
  });
});
