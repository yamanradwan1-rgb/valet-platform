import { createHash } from "node:crypto";

import { generate } from "otplib";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmResponseSchema,
  staffMfaSelfRecoveryBeginResponseSchema,
} from "@valet/contracts";
import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const routes = {
  begin: "/v1/staff/auth/mfa/enrollment/begin",
  confirm: "/v1/staff/auth/mfa/enrollment/confirm",
  recover: "/v1/staff/auth/mfa/recovery/begin",
  state: "/v1/staff/auth/mfa/state",
  stepUp: "/v1/staff/auth/mfa/step-up",
} as const;
const fixture = new StaffMfaTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function refreshHash(token: string): string {
  return `staff-refresh-sha256:v1:${createHash("sha256").update(token).digest("hex")}`;
}

async function totp(secret: string, offset = 0): Promise<string> {
  const clock = await fixture.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const step = Math.floor(clock.rows[0]!.now.getTime() / 30_000) + offset;
  return generate({
    algorithm: "sha1",
    digits: 6,
    epoch: step * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
}

async function enroll(accessToken: string) {
  const begun = await fixture.postMfa(routes.begin, accessToken);
  expect(begun.status).toBe(200);
  const begin = staffMfaEnrollmentBeginResponseSchema.parse(begun.body);
  const confirmed = await fixture.postMfa(routes.confirm, accessToken, {
    code: await totp(begin.provisioning.secretBase32),
    factorId: begin.factorId,
  });
  expect(confirmed.status).toBe(200);
  const confirmation = staffMfaEnrollmentConfirmResponseSchema.parse(
    confirmed.body,
  );
  return { begin, confirmation };
}

async function waitForBlockedQuery(fragment: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await fixture.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database()
           AND state = 'active'
           AND wait_event_type = 'Lock'
           AND query LIKE $1
       ) AS blocked`,
      [`%${fragment}%`],
    );
    if (result.rows[0]?.blocked === true) return;
  }
  throw new Error(
    `Timed out waiting for blocked PostgreSQL query: ${fragment}`,
  );
}

async function lockRefresh(refreshToken: string): Promise<PoolClient> {
  const client = await fixture.databasePool().connect();
  await client.query("BEGIN");
  await client.query(
    `SELECT id FROM staff_refresh_credentials WHERE token_hash = $1 FOR UPDATE`,
    [refreshHash(refreshToken)],
  );
  return client;
}

describe("MGT-BE-02 Staff MFA session races", () => {
  it("lets step-up finish while refresh waits and refresh does not slide MFA facts", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin } = await enroll(auth.accessToken);
    const refreshLock = await lockRefresh(auth.refreshToken);
    let lockOpen = true;
    try {
      const refreshing = fixture.refresh(auth.refreshToken);
      await waitForBlockedQuery("FROM staff_refresh_credentials AS refresh");
      const stepped = await fixture.postMfa(routes.stepUp, auth.accessToken, {
        code: await totp(begin.provisioning.secretBase32, 1),
      });
      expect(stepped.status).toBe(200);
      const afterStepUp = (await fixture.sessionSnapshot(auth.sessionId))
        .rows[0]!;

      await refreshLock.query("COMMIT");
      lockOpen = false;
      refreshLock.release();
      const refreshed = await refreshing;
      expect(refreshed.status).toBe(200);
      const afterRefresh = (await fixture.sessionSnapshot(auth.sessionId))
        .rows[0]!;
      expect(afterRefresh.mfa_authenticated_at).toEqual(
        afterStepUp.mfa_authenticated_at,
      );
      expect(afterRefresh.last_admin_activity_at).toEqual(
        afterStepUp.last_admin_activity_at,
      );
      expect(afterRefresh.mfa_factor_id).toBe(afterStepUp.mfa_factor_id);
      expect(afterRefresh.absolute_expires_at).toEqual(
        afterStepUp.absolute_expires_at,
      );
    } catch (error) {
      if (lockOpen) {
        await refreshLock.query("ROLLBACK").catch(() => undefined);
        refreshLock.release();
      }
      throw error;
    }
  });

  it("makes refresh replay revocation final for state and step-up", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin } = await enroll(auth.accessToken);
    const refreshed = await fixture.refresh(auth.refreshToken);
    expect(refreshed.status).toBe(200);
    const nextAccess = String(refreshed.body?.accessToken);

    expect((await fixture.refresh(auth.refreshToken)).status).toBe(401);
    expect((await fixture.getMfa(routes.state, nextAccess)).status).toBe(401);
    const stepUp = await fixture.postMfa(routes.stepUp, nextAccess, {
      code: await totp(begin.provisioning.secretBase32, 1),
    });
    expect(stepUp.status).toBe(401);
    expect((await fixture.getMfa(routes.state, nextAccess)).status).toBe(401);
    expect(
      (await fixture.sessionSnapshot(auth.sessionId)).rows[0]?.revoked_at,
    ).toBeInstanceOf(Date);
  });

  it("keeps logout revocation authoritative over existing assurance", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin } = await enroll(auth.accessToken);
    expect((await fixture.logout(auth.refreshToken)).status).toBe(204);

    const session = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(session.mfa_factor_id).toBe(begin.factorId);
    expect(session.mfa_authenticated_at).toBeInstanceOf(Date);
    expect(session.revoked_at).toBeInstanceOf(Date);
    expect((await fixture.getMfa(routes.state, auth.accessToken)).status).toBe(
      401,
    );
    expect(
      (
        await fixture.postMfa(routes.stepUp, auth.accessToken, {
          code: await totp(begin.provisioning.secretBase32, 1),
        })
      ).status,
    ).toBe(401);
  });

  it("rechecks a User disabled while MFA state waits on the User lock", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin } = await enroll(auth.accessToken);
    const userLock = await fixture.databasePool().connect();
    await userLock.query("BEGIN");
    await userLock.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [
      admin.userId,
    ]);
    let lockOpen = true;
    try {
      const state = fixture.getMfa(routes.state, auth.accessToken);
      await waitForBlockedQuery("FOR UPDATE OF session, staff_user");
      await userLock.query(
        `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
        [admin.userId],
      );
      await userLock.query("COMMIT");
      lockOpen = false;
      userLock.release();
      expect((await state).status).toBe(401);
    } catch (error) {
      if (lockOpen) {
        await userLock.query("ROLLBACK").catch(() => undefined);
        userLock.release();
      }
      throw error;
    }
    expect(
      (
        await fixture.postMfa(routes.stepUp, auth.accessToken, {
          code: await totp(begin.provisioning.secretBase32, 1),
        })
      ).status,
    ).toBe(401);
  });

  it("invalidates factor A assurance across two sessions when recovery creates pending B", async () => {
    const admin = await fixture.createCompanyAdmin();
    const first = await fixture.nativeLogin(admin);
    const second = await fixture.nativeLogin(admin);
    const { begin, confirmation } = await enroll(first.accessToken);
    const secondStep = await fixture.postMfa(
      routes.stepUp,
      second.accessToken,
      {
        code: await totp(begin.provisioning.secretBase32, 1),
      },
    );
    expect(secondStep.status).toBe(200);

    const recovered = await fixture.postMfa(routes.recover, first.accessToken, {
      recoveryCode: confirmation.recoveryCodes[0],
    });
    expect(recovered.status).toBe(200);
    const replacement = staffMfaSelfRecoveryBeginResponseSchema.parse(
      recovered.body,
    );
    expect(replacement.factorId).not.toBe(begin.factorId);

    for (const auth of [first, second]) {
      const state = await fixture.getMfa(routes.state, auth.accessToken);
      expect(state.status).toBe(200);
      expect(state.body).toEqual({ state: "ENROLLMENT_PENDING" });
      expect(
        (await fixture.sessionSnapshot(auth.sessionId)).rows[0]?.mfa_factor_id,
      ).toBe(begin.factorId);
    }
    expect(
      (
        await fixture.postMfa(routes.stepUp, first.accessToken, {
          code: await totp(begin.provisioning.secretBase32),
        })
      ).status,
    ).toBe(403);
  });

  it("prevents step-up after the base session absolute expiry", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin } = await enroll(auth.accessToken);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET mfa_authenticated_at = NULL, mfa_factor_id = NULL,
           last_admin_activity_at = NULL,
           access_expires_at = created_at + INTERVAL '1 millisecond',
           absolute_expires_at = created_at + INTERVAL '1 millisecond'
       WHERE id = $1`,
      [auth.sessionId],
    );
    const stepUp = await fixture.postMfa(routes.stepUp, auth.accessToken, {
      code: await totp(begin.provisioning.secretBase32, 1),
    });
    expect(stepUp.status).toBe(401);
    expect((await fixture.getMfa(routes.state, auth.accessToken)).status).toBe(
      401,
    );
  });
});
