import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConditionPhotoP1TestContext } from "./condition-photo-p1-test-context";

let ctx: ConditionPhotoP1TestContext;
const validHash = `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`;
const newScopes = [
  "v1:condition-photo-upload-user",
  "v1:condition-photo-upload-session",
  "v1:condition-photo-status-user",
] as const;

beforeAll(async () => {
  ctx = new ConditionPhotoP1TestContext();
  await ctx.start();
}, 210_000);

afterAll(async () => {
  await ctx?.stop();
}, 60_000);

describe("Issue #215 P2 forward-only durable anti-abuse scope migration", () => {
  it("accepts all three photo scopes as COUNTED events on actual PostgreSQL", async () => {
    for (const scope of newScopes) {
      const result = await ctx.pool.query<{ scope: string }>(
        `INSERT INTO anti_abuse_events(scope,key_hash,state)
         VALUES($1,$2,'COUNTED') RETURNING scope`,
        [scope, validHash],
      );
      expect(result.rows[0]?.scope).toBe(scope);
    }
    const result = await ctx.pool.query<{ scopes: string[] }>(
      `SELECT array_agg(DISTINCT scope ORDER BY scope) AS scopes
       FROM anti_abuse_events WHERE scope LIKE 'v1:condition-photo-%'`,
    );
    expect(result.rows[0]?.scopes).toEqual([...newScopes].sort());
  });

  it("preserves older accepted scopes without changing existing events", async () => {
    const old = [
      "v1:guest-token",
      "v1:staff-login-identifier",
      "v1:shift-presence-status-user",
    ];
    for (const scope of old) {
      await expect(ctx.pool.query(
        `INSERT INTO anti_abuse_events(scope,key_hash,state)
         VALUES($1,$2,'COUNTED')`,
        [scope, validHash],
      )).resolves.toMatchObject({ rowCount: 1 });
    }
    const result = await ctx.pool.query<{ total: number }>(
      `SELECT count(*)::integer AS total FROM anti_abuse_events
       WHERE scope = ANY($1::text[])`,
      [old],
    );
    expect(result.rows[0]?.total).toBe(3);
  });

  it("continues rejecting unknown or legacy-removed scopes", async () => {
    await expect(ctx.pool.query(
      `INSERT INTO anti_abuse_events(scope,key_hash,state)
       VALUES('v1:condition-photo-unbounded',$1,'COUNTED')`,
      [validHash],
    )).rejects.toMatchObject({
      code: "23514",
      constraint: "anti_abuse_events_scope_check",
    });
  });
});
