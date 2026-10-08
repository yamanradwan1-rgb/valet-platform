import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseMaintenance } from "../src/modules/anti-abuse/anti-abuse-maintenance";
import { presenceAbuseLimits } from "../src/modules/shifts/shift-presence-anti-abuse";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-anti-abuse-privacy");
let http: Awaited<ReturnType<typeof presenceHttp>>;
const prefix = "/v1/staff/shifts/presence";
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("presence quota privacy and authentication order", () => {
  it("preserves existing cleanup eligibility after one hour without sleeping or resetting live quotas", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const key = new AntiAbuseKeyDeriver().derive(
      presenceAbuseLimits.CHALLENGE.scope,
      f.userId,
    );
    await db.adminPool.query(
      `INSERT INTO anti_abuse_events(scope,key_hash,state,occurred_at)
      SELECT $1,$2,'COUNTED',clock_timestamp()-interval '61 minutes' FROM generate_series(1,30)`,
      [key.scope, key.keyHash],
    );
    expect(
      (
        await http.request("POST", `${prefix}/challenges`, auth.token, {
          action: "START",
          targetLocationId: f.locationId,
          operationId: randomUUID(),
        })
      ).status,
    ).toBe(200);
    await new AntiAbuseMaintenance(db.runtimePool).run();
    const remaining = (
      await db.adminPool.query(
        `SELECT count(*)::integer AS count FROM anti_abuse_events WHERE scope=$1 AND key_hash=$2`,
        [key.scope, key.keyHash],
      )
    ).rows[0].count;
    expect(remaining).toBe(1);
  });
  it("stores only domain-separated HMAC facts, never raw request/location/token/cash material", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const key = new AntiAbuseKeyDeriver().derive(
      presenceAbuseLimits.CHALLENGE.scope,
      f.userId,
    );
    const body = {
      action: "START",
      targetLocationId: f.locationId,
      operationId: randomUUID(),
      latitude: 31.987654321,
      cashReported: "9182.73",
      note: "PRIVATE_REQUEST_SENTINEL",
    };
    expect(
      (await http.request("POST", `${prefix}/challenges`, auth.token, body))
        .status,
    ).toBe(400);
    const rows = (
      await db.adminPool.query(
        `SELECT * FROM anti_abuse_events WHERE scope=$1 AND key_hash=$2`,
        [key.scope, key.keyHash],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "group_key_hash",
      "id",
      "key_hash",
      "occurred_at",
      "request_class",
      "scope",
      "state",
    ]);
    expect(rows[0]).toMatchObject({
      group_key_hash: null,
      request_class: null,
    });
    expect(rows[0].key_hash).toMatch(
      /^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$/,
    );
    const serialized = JSON.stringify(rows);
    for (const value of [
      f.userId,
      f.organizationId,
      f.locationId,
      auth.token,
      body.operationId,
      String(body.latitude),
      body.cashReported,
      body.note,
    ])
      expect(serialized).not.toContain(value);
  });
  it("rejects missing/stale authentication before charging quota", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const before = (
      await db.adminPool.query(
        `SELECT count(*)::integer AS count FROM anti_abuse_events`,
      )
    ).rows[0].count;
    await db.adminPool.query(
      `UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`,
      [auth.context.staffAuthSessionId],
    );
    for (const token of [undefined, auth.token])
      expect(
        (
          await http.request(
            "GET",
            `${prefix}/operations/${randomUUID()}`,
            token,
          )
        ).status,
      ).toBe(401);
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::integer AS count FROM anti_abuse_events`,
        )
      ).rows[0].count,
    ).toBe(before);
  });
});
