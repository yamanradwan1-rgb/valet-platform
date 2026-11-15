import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OptionCT5Fixture, syntheticUuid } from "./probe-fixture";

const fixture = new OptionCT5Fixture();
const mfaState = "/v1/staff/auth/mfa/state";
const forge = (prefix: "vsa1." | "vsr1.") =>
  `${prefix}${randomBytes(32).toString("base64url")}`;
const hash = (kind: "access" | "refresh", token: string) =>
  `staff-${kind}-sha256:v1:${createHash("sha256").update(token).digest("hex")}`;

beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

describe("Option C S01 T5 SQL-only session/refresh origin → real mounted Auth", () => {
  it("does not accept a SQL-inserted access session with an attacker-chosen bearer", async () => {
    const admin = await fixture.admin();
    expect(
      (await fixture.getMfa(mfaState, admin.auth.accessToken)).status,
    ).toBe(200);
    const forged = forge("vsa1.");
    const result = await fixture.runtimeSql(
      `INSERT INTO staff_auth_sessions
         (id,user_id,current_access_token_hash,access_expires_at,
          absolute_expires_at,created_at,last_rotated_at)
       VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes',
              clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`,
      [syntheticUuid(), admin.user.id, hash("access", forged)],
    );
    const mounted = await fixture.getMfa(mfaState, forged);
    // Both the effective SQL grant and actual acceptance are independently tested.
    expect(mounted.status).toBe(401);
    expect(result.allowed).toBe(false);
  });

  it("does not resurrect a genuinely logged-out bearer using runtime SQL", async () => {
    const admin = await fixture.admin();
    expect((await fixture.logout(admin.auth.refreshToken)).status).toBe(204);
    expect(
      (await fixture.getMfa(mfaState, admin.auth.accessToken)).status,
    ).toBe(401);
    const result = await fixture.runtimeSql(
      `UPDATE staff_auth_sessions SET revoked_at=NULL,
         access_expires_at=clock_timestamp()+interval '10 minutes'
       WHERE id=$1 RETURNING id`,
      [admin.auth.sessionId],
    );
    expect(
      (await fixture.getMfa(mfaState, admin.auth.accessToken)).status,
    ).toBe(401);
    expect(result.allowed).toBe(false);
  });

  it("rejects expired access credentials even if the verifier remains intact", async () => {
    const admin = await fixture.admin();
    await fixture.query(
      `UPDATE staff_auth_sessions SET
         created_at=clock_timestamp()-interval '1 day',
         access_expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1`,
      [admin.auth.sessionId],
    );
    expect(
      (await fixture.getMfa(mfaState, admin.auth.accessToken)).status,
    ).toBe(401);
  });

  it("rejects a SQL-inserted refresh verifier on a real Staff session", async () => {
    const admin = await fixture.admin();
    const forged = forge("vsr1.");
    // A SQL-only attacker with the legacy column grants can retire the
    // present generation and insert its own new refresh credential. A single
    // INSERT while the legitimate refresh is current must hit a unique guard.
    const retired = await fixture.runtimeSql(
      `UPDATE staff_refresh_credentials SET consumed_at=clock_timestamp()
       WHERE session_id=$1 AND consumed_at IS NULL RETURNING id`,
      [admin.auth.sessionId],
    );
    const inserted = await fixture.runtimeSql(
      `INSERT INTO staff_refresh_credentials
         (id,session_id,token_hash,generation,created_at,expires_at)
       VALUES($1,$2,$3,2,clock_timestamp(),clock_timestamp()+interval '10 minutes')`,
      [syntheticUuid(), admin.auth.sessionId, hash("refresh", forged)],
    );
    const mounted = await fixture.refresh(forged);
    expect(mounted.status).toBe(401);
    expect(retired.allowed).toBe(false);
    expect(inserted.allowed).toBe(false);
  });
});
