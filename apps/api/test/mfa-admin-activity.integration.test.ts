import { randomUUID } from "node:crypto";

import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { recordAdminActivityInTransaction } from "../src/modules/auth/mfa/mfa-assurance-policy";
import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const fixture = new StaffMfaTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

async function enroll() {
  const admin = await fixture.createCompanyAdmin();
  const auth = await fixture.nativeLogin(admin);
  const begun = await fixture.postMfa(
    "/v1/staff/auth/mfa/enrollment/begin",
    auth.accessToken,
  );
  expect(begun.status).toBe(200);
  const factorId = String(begun.body?.factorId);
  const provisioning = begun.body?.provisioning as
    { readonly secretBase32?: unknown } | undefined;
  const secret = String(provisioning?.secretBase32);
  const clock = await fixture.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const step = Math.floor(clock.rows[0]!.now.getTime() / 1_000 / 30);
  const code = await generate({
    algorithm: "sha1",
    digits: 6,
    epoch: step * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
  const confirmed = await fixture.postMfa(
    "/v1/staff/auth/mfa/enrollment/confirm",
    auth.accessToken,
    { code, factorId },
  );
  expect(confirmed.status).toBe(200);
  const created = await fixture.query<{ created_at: Date }>(
    `SELECT created_at FROM staff_auth_sessions WHERE id = $1`,
    [auth.sessionId],
  );
  return {
    admin,
    auth,
    context: {
      accessTokenHash: staffCredentialHash("access", auth.accessToken),
      createdAt: created.rows[0]!.created_at,
      staffAuthSessionId: auth.sessionId,
      userId: admin.userId,
    },
    factorId,
  };
}

async function recordActivity(
  context: Awaited<ReturnType<typeof enroll>>["context"],
) {
  const client = await fixture.databasePool().connect();
  try {
    await client.query("BEGIN");
    await recordAdminActivityInTransaction(
      client as unknown as PostgresTransaction,
      context,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

describe("MGT-BE-02 admin activity recording", () => {
  it("advances only admin activity and never slides MFA authentication time", async () => {
    const { auth, context } = await enroll();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at = clock_timestamp() - INTERVAL '2 minutes',
           mfa_authenticated_at = clock_timestamp() - INTERVAL '1 minute',
           last_admin_activity_at = clock_timestamp() - INTERVAL '1 minute'
       WHERE id = $1`,
      [auth.sessionId],
    );
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    await recordActivity(context);
    const after = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;

    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
    expect(after.mfa_factor_id).toBe(before.mfa_factor_id);
    expect(after.last_admin_activity_at!.getTime()).toBeGreaterThan(
      before.last_admin_activity_at!.getTime(),
    );
  });

  it("does not count refresh, push registration, or MFA state reads as admin activity", async () => {
    const { auth } = await enroll();
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;

    const refreshed = await fixture.refresh(auth.refreshToken);
    expect(refreshed.status).toBe(200);
    const nextAccessToken = String(refreshed.body?.accessToken);
    const afterRefresh = (await fixture.sessionSnapshot(auth.sessionId))
      .rows[0]!;
    expect(afterRefresh.mfa_authenticated_at).toEqual(
      before.mfa_authenticated_at,
    );
    expect(afterRefresh.last_admin_activity_at).toEqual(
      before.last_admin_activity_at,
    );
    expect(afterRefresh.mfa_factor_id).toBe(before.mfa_factor_id);

    const push = await fixture.request("/v1/staff/push/registrations", {
      authorization: `Bearer ${nextAccessToken}`,
      body: {
        appBuild: "100",
        appIdentifier: "com.vaylet.employee",
        appVersion: "1.0.0",
        installationId: randomUUID(),
        locale: "en",
        platform: "ANDROID",
        provider: "FCM",
        providerToken: `mfa-activity-test-${randomUUID()}`,
      },
      method: "PUT",
    });
    expect(push.status).toBe(200);
    const afterPush = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(afterPush.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
    expect(afterPush.last_admin_activity_at).toEqual(
      before.last_admin_activity_at,
    );

    const state = await fixture.getMfa(
      "/v1/staff/auth/mfa/state",
      nextAccessToken,
    );
    expect(state.status).toBe(200);
    const afterState = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(afterState.mfa_authenticated_at).toEqual(
      before.mfa_authenticated_at,
    );
    expect(afterState.last_admin_activity_at).toEqual(
      before.last_admin_activity_at,
    );
  });

  it("fails closed after session revocation", async () => {
    const revoked = await enroll();
    await fixture.query(
      `UPDATE staff_auth_sessions SET revoked_at = clock_timestamp() WHERE id = $1`,
      [revoked.auth.sessionId],
    );
    await expect(recordActivity(revoked.context)).rejects.toMatchObject({
      code: "MFA_STEP_UP_REQUIRED",
    });
  });

  it("fails closed after session expiry", async () => {
    const expired = await enroll();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET access_expires_at = created_at + INTERVAL '1 millisecond'
       WHERE id = $1`,
      [expired.auth.sessionId],
    );
    await expect(recordActivity(expired.context)).rejects.toMatchObject({
      code: "MFA_STEP_UP_REQUIRED",
    });
  });

  it("fails closed after factor retirement", async () => {
    const replaced = await enroll();
    await fixture.query(
      `UPDATE user_mfa_totp_factors
       SET state = 'RETIRED', retired_at = clock_timestamp()
       WHERE id = $1`,
      [replaced.factorId],
    );
    await expect(recordActivity(replaced.context)).rejects.toMatchObject({
      code: "MFA_STEP_UP_REQUIRED",
    });
  });

  it("allows recent activity without sliding the fixed eight-hour MFA origin", async () => {
    const { auth, context } = await enroll();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at = clock_timestamp() - INTERVAL '9 hours',
           mfa_authenticated_at = clock_timestamp() - INTERVAL '7 hours 59 minutes',
           last_admin_activity_at = clock_timestamp() - INTERVAL '10 minutes'
       WHERE id = $1`,
      [auth.sessionId],
    );
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    await recordActivity(context);
    const after = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
    expect(after.last_admin_activity_at!.getTime()).toBeGreaterThan(
      before.last_admin_activity_at!.getTime(),
    );

    await fixture.query(
      `UPDATE staff_auth_sessions
       SET mfa_authenticated_at = clock_timestamp() - INTERVAL '8 hours',
           last_admin_activity_at = clock_timestamp() - INTERVAL '1 minute'
       WHERE id = $1`,
      [auth.sessionId],
    );
    await expect(recordActivity(context)).rejects.toMatchObject({
      code: "MFA_STEP_UP_REQUIRED",
    });
  });
});
