import { randomUUID } from "node:crypto";

import { generate } from "otplib";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmResponseSchema,
} from "@valet/contracts";
import { persistControlledMfaRecovery } from "../tools/mfa-recovery/persistence";
import type { RecoveryDatabaseClient } from "../tools/mfa-recovery/types";
import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const fixture = new StaffMfaTestFixture();
const routes = {
  begin: "/v1/staff/auth/mfa/enrollment/begin",
  confirm: "/v1/staff/auth/mfa/enrollment/confirm",
  recover: "/v1/staff/auth/mfa/recovery/begin",
  state: "/v1/staff/auth/mfa/state",
  stepUp: "/v1/staff/auth/mfa/step-up",
} as const;

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

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
  return {
    begin,
    confirmation: staffMfaEnrollmentConfirmResponseSchema.parse(confirmed.body),
  };
}

async function holdUser(userId: string): Promise<PoolClient> {
  const client = await fixture.databasePool().connect();
  await client.query("BEGIN");
  await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
  return client;
}

async function holdSession(sessionId: string): Promise<PoolClient> {
  const client = await fixture.databasePool().connect();
  await client.query("BEGIN");
  await client.query(
    `SELECT id FROM staff_auth_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  return client;
}

async function waitForBlocked(fragment: string, minimum = 1): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await fixture.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND state = 'active'
         AND wait_event_type = 'Lock'
         AND query LIKE $1`,
      [`%${fragment}%`],
    );
    if ((result.rows[0]?.count ?? 0) >= minimum) return;
  }
  throw new Error(`Blocked-query barrier not reached: ${fragment}`);
}

describe("MGT-BE-02 authority races", () => {
  it("makes refresh replay revocation authoritative over a concurrent TOTP step-up", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin } = await enroll(auth.accessToken);
    const rotated = await fixture.refresh(auth.refreshToken);
    expect(rotated.status).toBe(200);
    const nextAccess = String(rotated.body?.accessToken);
    const sessionLock = await holdSession(auth.sessionId);
    try {
      const replay = fixture.refresh(auth.refreshToken);
      const stepUp = fixture.postMfa(routes.stepUp, nextAccess, {
        code: await totp(begin.provisioning.secretBase32, 1),
      });
      await waitForBlocked("staff_auth_sessions", 2);
      await sessionLock.query("COMMIT");
      sessionLock.release();

      expect((await replay).status).toBe(401);
      expect([200, 401]).toContain((await stepUp).status);
    } catch (error) {
      await sessionLock.query("ROLLBACK").catch(() => undefined);
      sessionLock.release();
      throw error;
    }
    expect(
      (await fixture.sessionSnapshot(auth.sessionId)).rows[0]?.revoked_at,
    ).toBeInstanceOf(Date);
    expect((await fixture.getMfa(routes.state, nextAccess)).status).toBe(401);
  });

  it("keeps logout and push disable final against a concurrent TOTP step-up", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin } = await enroll(auth.accessToken);
    const push = await fixture.request("/v1/staff/push/registrations", {
      authorization: `Bearer ${auth.accessToken}`,
      body: {
        appBuild: "100",
        appIdentifier: "com.vaylet.employee",
        appVersion: "1.0.0",
        installationId: randomUUID(),
        locale: "en",
        platform: "ANDROID",
        provider: "FCM",
        providerToken: `mfa-race-${randomUUID()}`,
      },
      method: "PUT",
    });
    expect(push.status).toBe(200);
    const sessionLock = await holdSession(auth.sessionId);
    try {
      const logout = fixture.logout(auth.refreshToken);
      const stepUp = fixture.postMfa(routes.stepUp, auth.accessToken, {
        code: await totp(begin.provisioning.secretBase32, 1),
      });
      await waitForBlocked("staff_auth_sessions", 2);
      await sessionLock.query("COMMIT");
      sessionLock.release();

      expect((await logout).status).toBe(204);
      expect([200, 401]).toContain((await stepUp).status);
    } catch (error) {
      await sessionLock.query("ROLLBACK").catch(() => undefined);
      sessionLock.release();
      throw error;
    }
    expect(
      (await fixture.sessionSnapshot(auth.sessionId)).rows[0]?.revoked_at,
    ).toBeInstanceOf(Date);
    const registrations = await fixture.query<{
      provider_token: string | null;
      state: string;
    }>(
      `SELECT state::text, provider_token FROM staff_push_registrations
       WHERE staff_auth_session_id = $1`,
      [auth.sessionId],
    );
    expect(registrations.rows).toEqual([
      expect.objectContaining({ provider_token: null, state: "DISABLED" }),
    ]);
  });

  it("makes factor replacement final against a concurrent old-factor step-up", async () => {
    const admin = await fixture.createCompanyAdmin();
    const first = await fixture.nativeLogin(admin);
    const second = await fixture.nativeLogin(admin);
    const { begin, confirmation } = await enroll(first.accessToken);
    const userLock = await holdUser(admin.userId);
    try {
      const recovery = fixture.postMfa(routes.recover, first.accessToken, {
        recoveryCode: confirmation.recoveryCodes[0],
      });
      const stepUp = fixture.postMfa(routes.stepUp, second.accessToken, {
        code: await totp(begin.provisioning.secretBase32, 1),
      });
      await waitForBlocked("FOR UPDATE OF session, staff_user", 2);
      await userLock.query("COMMIT");
      userLock.release();

      expect((await recovery).status).toBe(200);
      expect([200, 403]).toContain((await stepUp).status);
    } catch (error) {
      await userLock.query("ROLLBACK").catch(() => undefined);
      userLock.release();
      throw error;
    }
    const factors = await fixture.factors(admin.userId);
    expect(factors.rows.filter((row) => row.state === "RETIRED")).toHaveLength(
      1,
    );
    expect(factors.rows.filter((row) => row.state === "PENDING")).toHaveLength(
      1,
    );
    expect(
      (await fixture.getMfa(routes.state, second.accessToken)).body,
    ).toEqual({
      state: "ENROLLMENT_PENDING",
    });
  });

  it("serializes controlled recovery against self-recovery to one safe final state", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { confirmation } = await enroll(auth.accessToken);
    const operationId = randomUUID();
    const operatorClient = await fixture.databasePool().connect();
    const userLock = await holdUser(admin.userId);
    try {
      const selfRecovery = fixture.postMfa(routes.recover, auth.accessToken, {
        recoveryCode: confirmation.recoveryCodes[0],
      });
      const operatorRecovery = persistControlledMfaRecovery(
        operatorClient as unknown as RecoveryDatabaseClient,
        {
          operation: "recover-totp",
          operationId,
          operatorRef: "MFA-RACE-CASE-42",
          userId: admin.userId,
        },
      );
      await waitForBlocked("FOR UPDATE", 2);
      await userLock.query("COMMIT");
      userLock.release();

      await expect(operatorRecovery).resolves.toEqual({
        operationId,
        userId: admin.userId,
      });
      expect([200, 403]).toContain((await selfRecovery).status);
      await expect(
        persistControlledMfaRecovery(
          operatorClient as unknown as RecoveryDatabaseClient,
          {
            operation: "recover-totp",
            operationId,
            operatorRef: "MFA-RACE-CASE-42",
            userId: admin.userId,
          },
        ),
      ).resolves.toEqual({ operationId, userId: admin.userId });
    } catch (error) {
      await userLock.query("ROLLBACK").catch(() => undefined);
      userLock.release();
      throw error;
    } finally {
      operatorClient.release();
    }

    const factors = await fixture.factors(admin.userId);
    expect(factors.rows.every((row) => row.state === "RETIRED")).toBe(true);
    const operatorAudit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM account_security_audit_events
       WHERE id = $1 AND event_type = 'MFA_OPERATOR_RECOVERY'
         AND actor_type = 'CONTROLLED_OPERATOR'
         AND controlled_operator_ref = 'MFA-RACE-CASE-42'`,
      [operationId],
    );
    expect(operatorAudit.rows[0]?.count).toBe("1");
    expect((await fixture.getMfa(routes.state, auth.accessToken)).body).toEqual(
      {
        state: "ENROLLMENT_REQUIRED",
      },
    );
  });
});
