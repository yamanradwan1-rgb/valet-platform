import { generate } from "otplib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const fixture = new StaffMfaTestFixture();
const routes = {
  begin: "/v1/staff/auth/mfa/enrollment/begin",
  confirm: "/v1/staff/auth/mfa/enrollment/confirm",
  recover: "/v1/staff/auth/mfa/recovery/begin",
} as const;

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function required(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Synthetic MFA response is missing an expected field.");
  }
  return value;
}

function factor(body: Record<string, unknown> | undefined) {
  const provisioning = body?.provisioning as
    Record<string, unknown> | undefined;
  return {
    id: required(body?.factorId),
    secret: required(provisioning?.secretBase32),
  };
}

async function code(secret: string): Promise<string> {
  const clock = await fixture.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  const now = clock.rows[0]?.now;
  if (!now) throw new Error("Synthetic database clock missing.");
  return generate({
    algorithm: "sha1",
    digits: 6,
    epoch: Math.floor(now.getTime() / 30_000) * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
}

async function enrolled() {
  const account = await fixture.createCompanyAdmin();
  const sessionA = await fixture.nativeLogin(account);
  const sessionB = await fixture.nativeLogin(account);
  expect(sessionA.sessionId).not.toBe(sessionB.sessionId);
  const begun = await fixture.postMfa(routes.begin, sessionA.accessToken);
  expect(begun.status).toBe(200);
  const initial = factor(begun.body);
  const confirmed = await fixture.postMfa(
    routes.confirm,
    sessionA.accessToken,
    {
      code: await code(initial.secret),
      factorId: initial.id,
    },
  );
  expect(confirmed.status).toBe(200);
  const recoveryCodes = confirmed.body?.recoveryCodes;
  expect(recoveryCodes).toHaveLength(10);
  const recovery = await fixture.postMfa(routes.recover, sessionA.accessToken, {
    recoveryCode: required((recoveryCodes as unknown[])[0]),
  });
  expect(recovery.status).toBe(200);
  return { account, sessionA, sessionB, pending: factor(recovery.body) };
}

describe("Issue #363 exact StaffAuthSession owner for pending MFA", () => {
  it("permits only A to retrieve and confirm the replacement while B and C fail closed", async () => {
    const { account, sessionA, sessionB, pending } = await enrolled();
    const otherUser = await fixture.createCompanyAdmin();
    const sessionC = await fixture.nativeLogin(otherUser);

    const [againA, beginB, confirmB, confirmC] = await Promise.all([
      fixture.postMfa(routes.begin, sessionA.accessToken),
      fixture.postMfa(routes.begin, sessionB.accessToken),
      fixture.postMfa(routes.confirm, sessionB.accessToken, {
        factorId: pending.id,
        code: await code(pending.secret),
      }),
      fixture.postMfa(routes.confirm, sessionC.accessToken, {
        factorId: pending.id,
        code: await code(pending.secret),
      }),
    ]);
    expect(againA.status).toBe(200);
    expect(factor(againA.body)).toEqual(pending);
    expect(beginB.status).toBe(409);
    expect(beginB.body).toMatchObject({ code: "MFA_ENROLLMENT_NOT_AVAILABLE" });
    expect(confirmB.status).toBe(409);
    expect(confirmC.status).toBe(409);
    const owner = await fixture.query<{
      pending_enrollment_session_id: string | null;
    }>(
      `SELECT pending_enrollment_session_id::text
       FROM user_mfa_totp_factors WHERE id = $1 AND user_id = $2`,
      [pending.id, account.userId],
    );
    expect(owner.rows[0]?.pending_enrollment_session_id).toBe(
      sessionA.sessionId,
    );

    const confirmedA = await fixture.postMfa(
      routes.confirm,
      sessionA.accessToken,
      {
        code: await code(pending.secret),
        factorId: pending.id,
      },
    );
    expect(confirmedA.status).toBe(200);
    expect(confirmedA.body?.recoveryCodes).toHaveLength(10);
    const sessionBState = await fixture.sessionSnapshot(sessionB.sessionId);
    expect(sessionBState.rows[0]?.mfa_authenticated_at).toBeNull();
  });

  it("keeps A as owner after access-token refresh and rejects the replaced access token", async () => {
    const { sessionA, sessionB, pending } = await enrolled();
    const refreshed = await fixture.refresh(sessionA.refreshToken);
    expect(refreshed.status).toBe(200);
    const newAccess = required(refreshed.body?.accessToken);
    const [oldAccess, otherSession, newAccessBegin] = await Promise.all([
      fixture.postMfa(routes.begin, sessionA.accessToken),
      fixture.postMfa(routes.begin, sessionB.accessToken),
      fixture.postMfa(routes.begin, newAccess),
    ]);
    expect(oldAccess.status).toBe(401);
    expect(otherSession.status).toBe(409);
    expect(newAccessBegin.status).toBe(200);
    expect(factor(newAccessBegin.body)).toEqual(pending);
    const activated = await fixture.postMfa(routes.confirm, newAccess, {
      factorId: pending.id,
      code: await code(pending.secret),
    });
    expect(activated.status).toBe(200);
  });

  it("denies B even if the initiating A session has been revoked", async () => {
    const { sessionA, sessionB, pending } = await enrolled();
    await fixture.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
      [sessionA.sessionId],
    );
    const [revokedA, wrongB, confirmB] = await Promise.all([
      fixture.postMfa(routes.begin, sessionA.accessToken),
      fixture.postMfa(routes.begin, sessionB.accessToken),
      fixture.postMfa(routes.confirm, sessionB.accessToken, {
        factorId: pending.id,
        code: await code(pending.secret),
      }),
    ]);
    expect(revokedA.status).toBe(401);
    expect(wrongB.status).toBe(409);
    expect(confirmB.status).toBe(409);
    const rows = await fixture.query<{ state: string }>(
      "SELECT state::text FROM user_mfa_totp_factors WHERE id=$1",
      [pending.id],
    );
    expect(rows.rows[0]?.state).toBe("PENDING");
  });

  it("fails closed after A access expiry without allowing B to adopt the pending factor", async () => {
    const { sessionA, sessionB, pending } = await enrolled();
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET access_expires_at = clock_timestamp() - interval '1 millisecond'
       WHERE id = $1`,
      [sessionA.sessionId],
    );
    const [expiredA, beginB, confirmB] = await Promise.all([
      fixture.postMfa(routes.begin, sessionA.accessToken),
      fixture.postMfa(routes.begin, sessionB.accessToken),
      fixture.postMfa(routes.confirm, sessionB.accessToken, {
        factorId: pending.id,
        code: await code(pending.secret),
      }),
    ]);
    expect(expiredA.status).toBe(401);
    expect(beginB.status).toBe(409);
    expect(confirmB.status).toBe(409);
  });

  it("rejects tampering with the persisted owner while preserving legitimate A retry", async () => {
    const { sessionA, sessionB, pending } = await enrolled();
    await expect(
      fixture.query(
        `UPDATE user_mfa_totp_factors
         SET pending_enrollment_session_id = $2 WHERE id = $1`,
        [pending.id, sessionB.sessionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const retry = await fixture.postMfa(routes.begin, sessionA.accessToken);
    expect(retry.status).toBe(200);
    expect(factor(retry.body)).toEqual(pending);
  });
});
