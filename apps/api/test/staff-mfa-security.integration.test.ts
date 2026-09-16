import { generate } from "otplib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmResponseSchema,
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

async function codeAt(secret: string, offset = 0): Promise<string> {
  const clock = await fixture.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const step = Math.floor(clock.rows[0]!.now.getTime() / 1_000 / 30) + offset;
  return generate({
    algorithm: "sha1",
    digits: 6,
    epoch: step * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
}

async function definitelyInvalidTotp(secret: string): Promise<string> {
  const clock = await fixture.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const step = Math.floor(clock.rows[0]!.now.getTime() / 1_000 / 30);
  const accepted = new Set<string>();
  for (const offset of [-1, 0, 1]) {
    accepted.add(
      await generate({
        algorithm: "sha1",
        digits: 6,
        epoch: (step + offset) * 30,
        period: 30,
        secret,
        strategy: "totp",
      }),
    );
  }
  for (let value = 0; value < 1_000_000; value += 1) {
    const candidate = value.toString().padStart(6, "0");
    if (!accepted.has(candidate)) return candidate;
  }
  throw new Error("Unable to construct invalid TOTP fixture.");
}

async function enroll() {
  const admin = await fixture.createCompanyAdmin();
  const auth = await fixture.nativeLogin(admin);
  const begun = await fixture.postMfa(routes.begin, auth.accessToken);
  expect(begun.status).toBe(200);
  const begin = staffMfaEnrollmentBeginResponseSchema.parse(begun.body);
  const confirmation = await fixture.postMfa(routes.confirm, auth.accessToken, {
    code: await codeAt(begin.provisioning.secretBase32),
    factorId: begin.factorId,
  });
  expect(confirmation.status).toBe(200);
  const confirmed = staffMfaEnrollmentConfirmResponseSchema.parse(
    confirmation.body,
  );
  return { admin, auth, begin, confirmed };
}

async function limiterStates(scope: string) {
  const antiAbuse = await fixture.query<{
    state: string;
  }>(
    `SELECT state::text
     FROM anti_abuse_events
     WHERE scope = $1
       AND key_hash = (
         SELECT key_hash FROM anti_abuse_events
         WHERE scope = $1
         GROUP BY key_hash
         ORDER BY count(*) DESC
         LIMIT 1
       )
     ORDER BY occurred_at`,
    [scope],
  );
  return antiAbuse.rows.map((row) => row.state);
}

describe("MGT-BE-02 MFA security boundaries", () => {
  it("persists five bad TOTP proofs, ignores success, and blocks the sixth bad proof", async () => {
    const { auth, begin } = await enroll();
    await fixture.resetLimits();
    const badCode = await definitelyInvalidTotp(
      begin.provisioning.secretBase32,
    );

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(
        (
          await fixture.postMfa(routes.stepUp, auth.accessToken, {
            code: badCode,
          })
        ).status,
      ).toBe(403);
    }
    const success = await fixture.postMfa(routes.stepUp, auth.accessToken, {
      code: await codeAt(begin.provisioning.secretBase32, 1),
    });
    expect(success.status).toBe(200);
    expect(await limiterStates("v1:mfa-totp-user")).toEqual([
      "COUNTED",
      "COUNTED",
      "COUNTED",
      "COUNTED",
      "IGNORED",
    ]);
    const fifth = await fixture.postMfa(routes.stepUp, auth.accessToken, {
      code: badCode,
    });
    expect(fifth.status).toBe(403);
    expect(fifth.body).toMatchObject({ code: "MFA_VERIFICATION_FAILED" });
    const blocked = await fixture.postMfa(routes.stepUp, auth.accessToken, {
      code: badCode,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: "MFA_RATE_LIMITED" });
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await limiterStates("v1:mfa-totp-user")).toEqual([
      "COUNTED",
      "COUNTED",
      "COUNTED",
      "COUNTED",
      "IGNORED",
      "COUNTED",
    ]);
  });

  it("bounds recovery and keeps recovery-only re-enrollment unassured", async () => {
    const { admin, auth, begin, confirmed } = await enroll();
    await fixture.resetLimits();
    const badRecovery = `vmr1-${"A".repeat(11)}-${"B".repeat(27)}`;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(
        (
          await fixture.postMfa(routes.recover, auth.accessToken, {
            recoveryCode: badRecovery,
          })
        ).status,
      ).toBe(403);
    }

    const recovered = await fixture.postMfa(routes.recover, auth.accessToken, {
      recoveryCode: confirmed.recoveryCodes[0],
    });
    expect(recovered.status).toBe(200);
    const recovery = staffMfaEnrollmentBeginResponseSchema.parse(
      recovered.body,
    );
    expect(await limiterStates("v1:mfa-recovery-user")).toEqual([
      "COUNTED",
      "COUNTED",
      "COUNTED",
      "COUNTED",
      "IGNORED",
    ]);

    const factors = await fixture.factors(admin.userId);
    expect(factors.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: begin.factorId, state: "RETIRED" }),
        expect.objectContaining({ id: recovery.factorId, state: "PENDING" }),
      ]),
    );
    const state = await fixture.getMfa(routes.state, auth.accessToken);
    expect(state.status).toBe(200);
    expect(state.body).toEqual({ state: "ENROLLMENT_PENDING" });
    const session = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(session.mfa_factor_id).toBe(begin.factorId);
    expect(session.mfa_factor_id).not.toBe(recovery.factorId);

    expect(
      (
        await fixture.postMfa(routes.recover, auth.accessToken, {
          recoveryCode: badRecovery,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.postMfa(routes.recover, auth.accessToken, {
          recoveryCode: badRecovery,
        })
      ).status,
    ).toBe(429);
  });

  it("stores only protected MFA material and account-security audit facts", async () => {
    const { admin, auth, begin, confirmed } = await enroll();
    const factor = await fixture.query<{ protected_secret: string }>(
      `SELECT protected_secret FROM user_mfa_totp_factors WHERE id = $1`,
      [begin.factorId],
    );
    expect(factor.rows[0]?.protected_secret).toMatch(/^mte1\./);
    expect(factor.rows[0]?.protected_secret).not.toContain(
      begin.provisioning.secretBase32,
    );

    const recoveryColumns = await fixture.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'mfa_recovery_codes'`,
    );
    const recoveryColumnNames = recoveryColumns.rows.map(
      (row) => row.column_name,
    );
    expect(recoveryColumnNames).toEqual(
      expect.arrayContaining(["selector", "verifier"]),
    );
    expect(recoveryColumnNames.some((name) => /raw|code/i.test(name))).toBe(
      false,
    );
    const storedRecovery = await fixture.query<{
      selector: string;
      verifier: string;
    }>(
      `SELECT selector, verifier FROM mfa_recovery_codes WHERE factor_id = $1`,
      [begin.factorId],
    );
    expect(storedRecovery.rows).toHaveLength(10);
    for (const row of storedRecovery.rows) {
      expect(row.selector).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(row.verifier).toMatch(/^mrv1\.[A-Za-z0-9_-]{43}$/);
      expect(confirmed.recoveryCodes).not.toContain(row.verifier);
    }

    const beforeTenantAudit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE organization_id = $1`,
      [admin.organizationId],
    );
    expect(beforeTenantAudit.rows[0]?.count).toBe("0");
    const rawRecovery = confirmed.recoveryCodes[1]!;
    const recovered = await fixture.postMfa(routes.recover, auth.accessToken, {
      recoveryCode: rawRecovery,
    });
    expect(recovered.status).toBe(200);
    expect(
      (
        await fixture.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM audit_events WHERE organization_id = $1`,
          [admin.organizationId],
        )
      ).rows[0]?.count,
    ).toBe("0");

    const accountColumns = await fixture.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'account_security_audit_events'`,
    );
    const accountColumnNames = accountColumns.rows.map(
      (row) => row.column_name,
    );
    expect(accountColumnNames).not.toEqual(
      expect.arrayContaining(["organization_id", "location_id"]),
    );
    const audit = await fixture.query<Record<string, unknown>>(
      `SELECT * FROM account_security_audit_events
       WHERE subject_user_id = $1 ORDER BY occurred_at, id`,
      [admin.userId],
    );
    expect(audit.rows.map((row) => String(row.event_type)).sort()).toEqual([
      "MFA_FACTOR_REENROLLMENT_STARTED",
      "MFA_RECOVERY_CODE_USED",
      "MFA_TOTP_ACTIVATED",
    ]);
    expect(
      audit.rows.every(
        (row) =>
          row.actor_type === "USER" &&
          row.actor_user_id === admin.userId &&
          row.controlled_operator_ref === null,
      ),
    ).toBe(true);
    const serializedAudit = JSON.stringify(audit.rows);
    expect(serializedAudit).not.toContain(begin.provisioning.secretBase32);
    expect(serializedAudit).not.toContain(rawRecovery);
    for (const code of confirmed.recoveryCodes) {
      expect(serializedAudit).not.toContain(code);
    }
  });
});
