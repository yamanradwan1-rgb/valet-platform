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
import { staffRacePoolBarrierCloser, trackStaffRaceRequest } from "./staff-race-lock-observer";

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
  const enrollmentCode = await totp(begin.provisioning.secretBase32);
  const confirmed = await fixture.postMfa(routes.confirm, accessToken, {
    code: enrollmentCode,
    factorId: begin.factorId,
  });
  expect(confirmed.status).toBe(200);
  const confirmation = staffMfaEnrollmentConfirmResponseSchema.parse(
    confirmed.body,
  );
  return { begin, confirmation, enrollmentCode };
}

async function holdRow(sql: string, id: string): Promise<PoolClient> {
  const client = await fixture.databasePool().connect();
  try {
    await client.query("BEGIN");
    expect((await client.query(sql, [id])).rowCount).toBe(1);
    return client;
  } catch (error) {
    await staffRacePoolBarrierCloser(client).close("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

const lockRefresh = (token: string) =>
  holdRow("SELECT id FROM staff_refresh_credentials WHERE token_hash = $1 FOR UPDATE", refreshHash(token));
const lockFactor = (id: string) =>
  holdRow("SELECT id FROM user_mfa_totp_factors WHERE id = $1 FOR UPDATE", id);

describe("MGT-BE-02 Staff MFA session races", () => {
  it("serializes refresh first, rejects the stale step-up bearer and preserves MFA facts", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin } = await enroll(auth.accessToken);
    const code = await totp(begin.provisioning.secretBase32, 1);
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows;
    const factorsBefore = (await fixture.factors(admin.userId)).rows;
    const lock = await lockRefresh(auth.refreshToken);
    const barrier = staffRacePoolBarrierCloser(lock);
    const pending: Promise<unknown>[] = [];
    try {
      const refreshing = trackStaffRaceRequest(pending, fixture.refresh(auth.refreshToken));
      await fixture.waitForBlockedMfaQueries(lock);
      const stepping = trackStaffRaceRequest(pending, fixture.postMfa(routes.stepUp, auth.accessToken, { code }));
      await fixture.waitForBlockedMfaQueries(lock, 2);
      await barrier.close("COMMIT");
      const refreshed = await refreshing;
      expect(refreshed.status).toBe(200);
      expect((await stepping).status).toBe(401);
      expect((await fixture.sessionSnapshot(auth.sessionId)).rows).toEqual(before);
      expect((await fixture.factors(admin.userId)).rows).toEqual(factorsBefore);
      expect((await fixture.getMfa(routes.state, auth.accessToken)).status).toBe(401);
      expect((await fixture.getMfa(routes.state, String(refreshed.body?.accessToken))).status).toBe(200);
    } finally {
      await barrier.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(pending);
    }
  });

  it.each([false, true])("serializes step-up first before refresh, rejected ceremony=%s", async (rejectCeremony) => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const { begin, enrollmentCode } = await enroll(auth.accessToken);
    const code = rejectCeremony ? enrollmentCode : await totp(begin.provisioning.secretBase32, 1);
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows;
    const factorsBefore = (await fixture.factors(admin.userId)).rows;
    const factorLock = await lockFactor(begin.factorId);
    const factorBarrier = staffRacePoolBarrierCloser(factorLock);
    const pending: Promise<unknown>[] = [];
    let refreshBarrier: ReturnType<typeof staffRacePoolBarrierCloser> | undefined;
    try {
      const refreshLock = await lockRefresh(auth.refreshToken);
      refreshBarrier = staffRacePoolBarrierCloser(refreshLock);
      const stepping = trackStaffRaceRequest(pending, fixture.postMfa(routes.stepUp, auth.accessToken, { code }));
      await fixture.waitForBlockedMfaQueries(factorLock);
      const refreshing = trackStaffRaceRequest(pending, fixture.refresh(auth.refreshToken));
      await fixture.waitForBlockedMfaQueries(factorLock, 2);
      await factorBarrier.close("COMMIT");
      expect((await stepping).status).toBe(rejectCeremony ? 403 : 200);
      await fixture.waitForBlockedMfaQueries(refreshLock);
      const afterStepUp = (await fixture.sessionSnapshot(auth.sessionId)).rows;
      const factorsAfter = (await fixture.factors(admin.userId)).rows;
      if (rejectCeremony) {
        expect(afterStepUp).toEqual(before);
        expect(factorsAfter).toEqual(factorsBefore);
      } else {
        expect(afterStepUp[0]?.mfa_authenticated_at).not.toEqual(before[0]?.mfa_authenticated_at);
        expect(afterStepUp[0]?.last_admin_activity_at).toEqual(afterStepUp[0]?.mfa_authenticated_at);
        expect(afterStepUp[0]?.mfa_factor_id).toBe(begin.factorId);
        expect(factorsAfter[0]?.last_accepted_step).not.toEqual(factorsBefore[0]?.last_accepted_step);
      }
      await refreshBarrier.close("COMMIT");
      const refreshed = await refreshing;
      expect(refreshed.status).toBe(200);
      expect((await fixture.sessionSnapshot(auth.sessionId)).rows).toEqual(afterStepUp);
      expect((await fixture.factors(admin.userId)).rows).toEqual(factorsAfter);
      expect((await fixture.getMfa(routes.state, auth.accessToken)).status).toBe(401);
    } finally {
      await factorBarrier.close("ROLLBACK").catch(() => undefined);
      await refreshBarrier?.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(pending);
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
    const barrier = staffRacePoolBarrierCloser(userLock);
    const pending: Promise<unknown>[] = [];
    try {
      await userLock.query("BEGIN");
      const locked = await userLock.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [
        admin.userId,
      ]);
      expect(locked.rowCount).toBe(1);
      const state = trackStaffRaceRequest(pending, fixture.getMfa(routes.state, auth.accessToken));
      await fixture.waitForBlockedMfaQueries(userLock);
      await userLock.query(
        `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
        [admin.userId],
      );
      await barrier.close("COMMIT");
      expect((await state).status).toBe(401);
    } finally {
      await barrier.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(pending);
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
