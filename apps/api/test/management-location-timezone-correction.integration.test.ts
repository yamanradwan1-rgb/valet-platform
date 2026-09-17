import { randomUUID } from "node:crypto";

import { managementLocationTimezoneCorrectionResponseSchema } from "@valet/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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
    name: "Timezone correction org",
  });
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
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
      addressText: "Timezone correction address",
      code: `TZ-${randomUUID().slice(0, 8)}`,
      currency: "JOD",
      name: "Timezone correction location",
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

async function addHistoricalSession(
  organizationId: string,
  locationId: string,
  membershipId: string,
) {
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  const createdAt = new Date("2026-01-15T06:15:00.000Z");
  const completedAt = new Date("2026-01-15T08:45:00.000Z");
  await fixture.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,$4)`,
    [vehicleId, organizationId, `Timezone vehicle ${vehicleId}`, createdAt],
  );
  await fixture.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,
       customer_access_revoked_at,organization_id,location_id,vehicle_id,state,
       checked_in_by_membership_id,completed_by_membership_id,created_at,
       completed_at,version,updated_at)
     VALUES($1,$2,$3,$3,$4,$5,$6,'COMPLETED',$7,$7,$8,$9,1,$9)`,
    [
      sessionId,
      `timezone-disabled:${randomUUID()}`,
      completedAt,
      organizationId,
      locationId,
      vehicleId,
      membershipId,
      createdAt,
      completedAt,
    ],
  );
  return { completedAt, createdAt, sessionId };
}

async function sessionTimes(sessionId: string) {
  const result = await fixture.query<{
    completed_at: Date;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT created_at,completed_at,updated_at FROM valet_sessions WHERE id=$1`,
    [sessionId],
  );
  const row = result.rows[0]!;
  return {
    completedAt: row.completed_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

describe("MGT-BE-07 Location timezone correction", () => {
  it("requires valid IANA timezone/reason, INACTIVE drained state, CAS/current MFA, one audit, and preserves historical timestamps", async () => {
    const admin = await assuredAdmin();
    const created = await createInactiveLocation(
      admin.membership.organizationId,
      admin.auth.accessToken,
    );
    const base = locationPath(
      admin.membership.organizationId,
      created.locationId,
    );
    const historical = await addHistoricalSession(
      admin.membership.organizationId,
      created.locationId,
      admin.membership.membershipId,
    );
    const beforeTimes = await sessionTimes(historical.sessionId);

    const noReason = await fixture.managementPost(
      `${base}/timezone-correction`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: created.updatedAt,
        newTimezone: "America/New_York",
        reason: "",
      },
    );
    expect(noReason.status).toBe(400);
    expect(noReason.body).toMatchObject({ code: "REQUEST_INVALID" });

    const invalidZone = await fixture.managementPost(
      `${base}/timezone-correction`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: created.updatedAt,
        newTimezone: "Mars/Olympus",
        reason: "Correct imported timezone",
      },
    );
    expect(invalidZone.status).toBe(400);
    expect(invalidZone.body).toMatchObject({
      code: "CONFIGURATION_VALUE_INVALID",
    });

    const shiftId = await fixture.startActiveShift(
      admin.membership.organizationId,
      created.locationId,
      admin.membership.membershipId,
    );
    const blocked = await fixture.managementPost(
      `${base}/timezone-correction`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: created.updatedAt,
        newTimezone: "America/New_York",
        reason: "Correct imported timezone",
      },
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "LOCATION_INVALID_STATE" });
    await fixture.endShift(shiftId);

    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [admin.auth.sessionId],
    );
    const staleMfa = await fixture.managementPost(
      `${base}/timezone-correction`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: created.updatedAt,
        newTimezone: "America/New_York",
        reason: "Correct imported timezone",
      },
    );
    expect(staleMfa.status).toBe(403);
    expect(staleMfa.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect((await fixture.stepUp(admin.auth, admin.factor.secret)).status).toBe(
      200,
    );

    const corrected = await fixture.managementPost(
      `${base}/timezone-correction`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: created.updatedAt,
        newTimezone: "America/New_York",
        reason: "Correct imported timezone",
      },
    );
    expect(corrected.status).toBe(201);
    const typed = managementLocationTimezoneCorrectionResponseSchema.parse(
      corrected.body,
    );
    expect(typed.impact).toEqual({
      historicalReportFactsRewritten: false,
      historicalTimestampsRewritten: false,
      newTimezone: "America/New_York",
      previousTimezone: "Asia/Amman",
    });
    expect(typed.location).toMatchObject({
      status: "INACTIVE",
      timezone: "America/New_York",
    });
    expect(await sessionTimes(historical.sessionId)).toEqual(beforeTimes);

    const staleCas = await fixture.managementPost(
      `${base}/timezone-correction`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: created.updatedAt,
        newTimezone: "UTC",
        reason: "Second correction",
      },
    );
    expect(staleCas.status).toBe(409);
    expect(staleCas.body).toMatchObject({
      code: "LOCATION_LIFECYCLE_CONFLICT",
    });

    const activated = await fixture.managementPost(
      `${base}/activate`,
      admin.auth.accessToken,
      { expectedUpdatedAt: typed.location.updatedAt },
    );
    expect(activated.status).toBe(201);
    const activeRejected = await fixture.managementPost(
      `${base}/timezone-correction`,
      admin.auth.accessToken,
      {
        expectedUpdatedAt: String(activated.body?.updatedAt),
        newTimezone: "UTC",
        reason: "Should require inactive state",
      },
    );
    expect(activeRejected.status).toBe(409);
    expect(activeRejected.body).toMatchObject({
      code: "LOCATION_INVALID_STATE",
    });

    const audit = await fixture.query<{
      count: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT count(*)::text AS count,
              min(metadata_json::text)::jsonb AS metadata_json
       FROM audit_events
       WHERE organization_id=$1 AND location_id=$2
         AND event_type='LOCATION_TIMEZONE_CORRECTED'`,
      [admin.membership.organizationId, created.locationId],
    );
    expect(audit.rows[0]).toMatchObject({
      count: "1",
      metadata_json: {
        newTimezone: "America/New_York",
        previousTimezone: "Asia/Amman",
        reason: "Correct imported timezone",
      },
    });
  });
});
