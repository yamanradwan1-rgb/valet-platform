import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createInitializePaymentExecutor } from "../src/modules/payments/initialize-payment-command";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function locationsPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations`;
}

function locationPath(organizationId: string, locationId: string) {
  return `${locationsPath(organizationId)}/${locationId}`;
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    name: "Currency correction org",
  });
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
  await fixture.query(
    `UPDATE organizations SET valet_service_fee='10.000' WHERE id=$1`,
    [membership.organizationId],
  );
  return { auth, factor, membership };
}

async function createInactiveLocation(
  organizationId: string,
  accessToken: string,
) {
  const created = await fixture.managementPost(
    locationsPath(organizationId),
    accessToken,
    {
      addressText: "Currency correction address",
      code: `CUR-${randomUUID().slice(0, 8)}`,
      currency: "JOD",
      name: "Currency correction location",
      operationId: randomUUID(),
      timezone: "Asia/Amman",
    },
  );
  expect(created.status).toBe(201);
  return {
    locationId: String(created.body?.locationId),
    updatedAt: String(created.body?.updatedAt),
  };
}

async function addSession(
  organizationId: string,
  locationId: string,
  membershipId: string,
) {
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  await fixture.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,transaction_timestamp())`,
    [vehicleId, organizationId, `Currency vehicle ${vehicleId}`],
  );
  await fixture.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,
       customer_access_revoked_at,organization_id,location_id,vehicle_id,
       state,checked_in_by_membership_id,version,updated_at)
     VALUES($1,$2,transaction_timestamp(),transaction_timestamp(),$3,$4,$5,
            'CHECKING_IN',$6,1,transaction_timestamp())`,
    [
      sessionId,
      `currency-disabled:${randomUUID()}`,
      organizationId,
      locationId,
      vehicleId,
      membershipId,
    ],
  );
  return sessionId;
}

async function initializePayment(sessionId: string) {
  const pool = new Pool({ connectionString: fixture.runtimeDatabaseUrl() });
  try {
    return await createInitializePaymentExecutor(pool)({
      creationIdempotencyKey: randomUUID(),
      valetSessionId: sessionId,
    });
  } finally {
    await pool.end();
  }
}

describe("MGT-BE-07 Location currency correction", () => {
  it("enforces supported currency, drained INACTIVE state, CAS/current MFA, one audit, and immutable Payment currency snapshots without FX", async () => {
    const admin = await assuredAdmin();
    const created = await createInactiveLocation(
      admin.membership.organizationId,
      admin.auth.accessToken,
    );
    const base = locationPath(
      admin.membership.organizationId,
      created.locationId,
    );

    const unsupported = await fixture.managementPost(
      `${base}/currency-correction`,
      admin.auth.accessToken,
      { expectedUpdatedAt: created.updatedAt, newCurrency: "ZZZ" },
    );
    expect(unsupported.status).toBe(400);
    expect(unsupported.body).toMatchObject({
      code: "CONFIGURATION_VALUE_INVALID",
    });

    const oldSessionId = await addSession(
      admin.membership.organizationId,
      created.locationId,
      admin.membership.membershipId,
    );
    const oldPayment = await initializePayment(oldSessionId);
    expect(oldPayment).toMatchObject({
      currency: "JOD",
      serviceAmount: "10.000",
    });

    const blocked = await fixture.managementPost(
      `${base}/currency-correction`,
      admin.auth.accessToken,
      { expectedUpdatedAt: created.updatedAt, newCurrency: "USD" },
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "LOCATION_INVALID_STATE" });

    await fixture.query(
      `UPDATE valet_sessions
       SET state='COMPLETED',completed_at=clock_timestamp(),updated_at=clock_timestamp()
       WHERE id=$1`,
      [oldSessionId],
    );
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [admin.auth.sessionId],
    );

    const staleMfa = await fixture.managementPost(
      `${base}/currency-correction`,
      admin.auth.accessToken,
      { expectedUpdatedAt: created.updatedAt, newCurrency: "USD" },
    );
    expect(staleMfa.status).toBe(403);
    expect(staleMfa.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect((await fixture.stepUp(admin.auth, admin.factor.secret)).status).toBe(
      200,
    );

    const corrected = await fixture.managementPost(
      `${base}/currency-correction`,
      admin.auth.accessToken,
      { expectedUpdatedAt: created.updatedAt, newCurrency: "USD" },
    );
    expect(corrected.status).toBe(201);
    expect(corrected.body).toMatchObject({
      acceptingIntake: false,
      currency: "USD",
      status: "INACTIVE",
    });

    const staleCas = await fixture.managementPost(
      `${base}/currency-correction`,
      admin.auth.accessToken,
      { expectedUpdatedAt: created.updatedAt, newCurrency: "JPY" },
    );
    expect(staleCas.status).toBe(409);
    expect(staleCas.body).toMatchObject({
      code: "LOCATION_LIFECYCLE_CONFLICT",
    });

    const activated = await fixture.managementPost(
      `${base}/activate`,
      admin.auth.accessToken,
      { expectedUpdatedAt: String(corrected.body?.updatedAt) },
    );
    expect(activated.status).toBe(201);
    const activeRejected = await fixture.managementPost(
      `${base}/currency-correction`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: String(activated.body?.updatedAt),
        newCurrency: "JPY",
      },
    );
    expect(activeRejected.status).toBe(409);
    expect(activeRejected.body).toMatchObject({
      code: "LOCATION_INVALID_STATE",
    });

    const newSessionId = await addSession(
      admin.membership.organizationId,
      created.locationId,
      admin.membership.membershipId,
    );
    const newPayment = await initializePayment(newSessionId);
    expect(newPayment).toMatchObject({
      currency: "USD",
      serviceAmount: "10.000",
    });

    const payments = await fixture.query<{
      currency: string;
      service_amount: string;
    }>(
      `SELECT currency,service_amount::text FROM payments
       WHERE valet_session_id=ANY($1::uuid[]) ORDER BY created_at`,
      [[oldSessionId, newSessionId]],
    );
    expect(payments.rows).toEqual([
      { currency: "JOD", service_amount: "10.000" },
      { currency: "USD", service_amount: "10.000" },
    ]);

    const audit = await fixture.query<{
      count: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT count(*)::text AS count,
              min(metadata_json::text)::jsonb AS metadata_json
       FROM audit_events
       WHERE organization_id=$1 AND location_id=$2
         AND event_type='LOCATION_CURRENCY_CORRECTED'`,
      [admin.membership.organizationId, created.locationId],
    );
    expect(audit.rows[0]).toMatchObject({
      count: "1",
      metadata_json: { newCurrency: "USD", previousCurrency: "JOD" },
    });
  });
});
