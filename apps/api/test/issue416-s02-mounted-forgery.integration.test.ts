import { generate } from "otplib";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const fixture = new StaffMfaTestFixture();

beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 60_000);

it("rejects SQL-only forged MFA assurance and real Management HTTP remains denied", async () => {
  const admin = await fixture.createCompanyAdmin();
  const enrollmentSession = await fixture.nativeLogin(admin);
  const begun = await fixture.postMfa(
    "/v1/staff/auth/mfa/enrollment/begin",
    enrollmentSession.accessToken,
  );
  expect(begun.status).toBe(200);
  const factorId = String(begun.body?.factorId);
  const secret = String(
    (begun.body?.provisioning as { secretBase32?: unknown })?.secretBase32,
  );
  const clock = await fixture.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  const step = Math.floor(clock.rows[0]!.now.getTime() / 30_000);
  const code = await generate({
    algorithm: "sha1", digits: 6, epoch: step * 30,
    period: 30, secret, strategy: "totp",
  });
  const confirmed = await fixture.postMfa(
    "/v1/staff/auth/mfa/enrollment/confirm",
    enrollmentSession.accessToken, { factorId, code },
  );
  expect(confirmed.status).toBe(200);

  // A newly logged-in session may reference the current same-User factor,
  // but it has never completed a TOTP ceremony and MUST remain unassured.
  const second = await fixture.nativeLogin(admin);
  const before = (await fixture.sessionSnapshot(second.sessionId)).rows[0];
  expect(before?.mfa_factor_id).toBeNull();
  const management = "/v1/staff/management/organizations";
  expect(
    (await fixture.getMfa(management, second.accessToken)).status,
  ).toBe(403);

  const runtime = new Client({
    connectionString: fixture.runtimeDatabaseUrl(),
  });
  await runtime.connect();
  try {
    await expect(
      runtime.query(
        `UPDATE staff_auth_sessions
         SET mfa_authenticated_at=clock_timestamp(),
             mfa_factor_id=$2,
             last_admin_activity_at=clock_timestamp()
         WHERE id=$1`,
        [second.sessionId, factorId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      runtime.query(
        `UPDATE user_mfa_totp_factors
         SET last_accepted_step=last_accepted_step+1
         WHERE id=$1`,
        [factorId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  } finally {
    await runtime.end();
  }
  const after = (await fixture.sessionSnapshot(second.sessionId)).rows[0];
  expect(after?.mfa_factor_id).toBeNull();
  expect(after?.mfa_authenticated_at).toBeNull();
  expect(
    (await fixture.getMfa(management, second.accessToken)).status,
  ).toBe(403);
}, 60_000);
