import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OptionCAfterFixture, assertRuntimeDeny } from "./after-fixture";

const fixture = new OptionCAfterFixture();
beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

describe("Option C AFTER / S04 quota SQL and mounted Guest admission", () => {
  it("denies ordinary SQL COUNTED discount and protects the private proof key", async () => {
    const direct = await fixture.runtimeSql(
      `SELECT has_any_column_privilege(current_user,'public.anti_abuse_events','UPDATE') AS allowed`,
    );
    if (!direct.allowed) throw new Error("S04 effective privilege query failed.");
    expect(direct.result?.allowed).toBe(false);
    await assertRuntimeDeny(
      fixture,
      `UPDATE public.anti_abuse_events SET state='IGNORED'
       WHERE state='COUNTED' RETURNING id`,
    );
    const proofAccess = await fixture.runtimeSql(
      `SELECT has_schema_privilege(current_user,'s04_quota_guard','USAGE') AS allowed`,
    );
    if (!proofAccess.allowed) throw new Error("S04 private-schema ACL query failed.");
    expect(proofAccess.result?.allowed).toBe(false);
  });

  it("persists a real invalid Guest token as COUNTED despite SQL-only discount attempts", async () => {
    const token = randomBytes(32).toString("base64url");
    const response = await fixture.request("/v1/guest/session", {
      method: "GET", authorization: `Bearer ${token}`,
    });
    expect(response.status).toBe(401);
    expect(response.body?.code).toBe("GUEST_ACCESS_INVALID");
    const counts = await fixture.query<{ counted: string }>(
      `SELECT count(*)::text AS counted FROM public.anti_abuse_events
       WHERE scope='v1:guest-client-address' AND state='COUNTED'`,
    );
    expect(Number(counts.rows[0]?.counted)).toBeGreaterThan(0);
    await assertRuntimeDeny(
      fixture,
      `UPDATE public.anti_abuse_events SET state='IGNORED'
       WHERE scope='v1:guest-client-address' AND state='COUNTED' RETURNING id`,
    );
    const preserved = await fixture.query<{ counted: string }>(
      `SELECT count(*)::text AS counted FROM public.anti_abuse_events
       WHERE scope='v1:guest-client-address' AND state='COUNTED'`,
    );
    expect(preserved.rows[0]?.counted).toBe(counts.rows[0]?.counted);
  });

  it("rejects an unsigned SQL S04 proof instead of accepting a forged COUNTED event", async () => {
    const invalid = await fixture.runtimeSql(
      `SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)`,
      ["v1:guest-client-address", randomBytes(32).toString("hex"),
        randomUUID(), Date.now() + 60_000, "unsigned"],
    );
    expect(invalid.allowed).toBe(false);
    // Migration 162 raises 42501 for an invalid signed purpose proof.
    if (!invalid.allowed) expect(invalid.sqlstate).toBe("42501");
  });
});
