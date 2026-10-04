import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { presenceAbuseLimits } from "../src/modules/shifts/shift-presence-anti-abuse";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";

const db = new PresenceServerTestContext("presence-anti-abuse");
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

async function seed(
  userId: string,
  kind: keyof typeof presenceAbuseLimits,
  count: number,
) {
  const key = new AntiAbuseKeyDeriver().derive(
    presenceAbuseLimits[kind].scope,
    userId,
  );
  await db.adminPool.query(
    `INSERT INTO anti_abuse_events(scope,key_hash,state)
    SELECT $1,$2,'COUNTED' FROM generate_series(1,$3::integer)`,
    [key.scope, key.keyHash, count],
  );
  return key;
}
function limited(result: Awaited<ReturnType<typeof http.request>>) {
  expect(result.status).toBe(429);
  expect(result.body).toMatchObject({
    code: "SHIFT_PRESENCE_RATE_LIMITED",
    message: "Too many requests. Try again later.",
  });
  const retry = Number(result.headers.get("retry-after"));
  expect(Number.isInteger(retry)).toBe(true);
  expect(retry).toBeGreaterThanOrEqual(1);
  expect(retry).toBeLessThanOrEqual(900);
  expect(result.headers.get("cache-control")).toBe("no-store");
}
async function allocations() {
  return (
    await db.adminPool.query(`SELECT
    (SELECT count(*)::integer FROM shift_presence_operations) AS operations,
    (SELECT count(*)::integer FROM shift_presence_challenges) AS challenges`)
  ).rows[0];
}
describe("existing durable AntiAbuse bounds new presence routes by authenticated User", () => {
  it("allows the threshold request, blocks randomized identities with zero allocation, and isolates another User", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    await seed(f.userId, "CHALLENGE", 29);
    const body = () => ({
      action: "START",
      targetLocationId: f.locationId,
      operationId: randomUUID(),
    });
    expect(
      (await http.request("POST", `${prefix}/challenges`, auth.token, body()))
        .status,
    ).toBe(200);
    const before = await allocations();
    const replacementSession = await db.session(f.userId);
    for (const token of [auth.token, replacementSession.token]) {
      const blocked = body();
      limited(
        await http.request("POST", `${prefix}/challenges`, token, blocked),
      );
      expect(
        (
          await db.adminPool.query(
            `SELECT id FROM shift_presence_operations WHERE operation_id=$1`,
            [blocked.operationId],
          )
        ).rowCount,
      ).toBe(0);
    }
    expect(await allocations()).toEqual(before);
    const other = await db.createFixture();
    const otherAuth = await db.session(other.userId);
    expect(
      (
        await http.request("POST", `${prefix}/challenges`, otherAuth.token, {
          ...body(),
          targetLocationId: other.locationId,
        })
      ).status,
    ).toBe(200);
    expect(await allocations()).toEqual({
      operations: before.operations + 1,
      challenges: before.challenges + 1,
    });
  });
  it("bounds exception requests before foreign/random operation disclosure or exception allocation", async () => {
    await db.permitStrictFixtures();
    const f = await db.createFixture();
    await db.policy(f, "REQUIRE_OR_OVERRIDE");
    const auth = await db.session(f.userId);
    const challenge = await db.challenge(f, auth.context);
    await seed(f.userId, "EXCEPTION", 9);
    const body = {
      challengeId: challenge.challengeId,
      reason: "GPS_UNAVAILABLE",
    };
    expect(
      (
        await http.request(
          "POST",
          `${prefix}/operations/${challenge.operationId}/exception`,
          auth.token,
          body,
        )
      ).status,
    ).toBe(200);
    const count = (
      await db.adminPool.query(
        `SELECT count(*)::integer AS count FROM shift_presence_exceptions`,
      )
    ).rows[0].count;
    for (const op of [challenge.operationId, randomUUID()])
      limited(
        await http.request(
          "POST",
          `${prefix}/operations/${op}/exception`,
          auth.token,
          { ...body, challengeId: randomUUID() },
        ),
      );
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::integer AS count FROM shift_presence_exceptions`,
        )
      ).rows[0].count,
    ).toBe(count);
  });
  it("shares all three status quotas and conceals foreign selectors both below and at threshold", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const foreign = await db.createFixture();
    const foreignAuth = await db.session(foreign.userId);
    const challenge = await db.challenge(foreign, foreignAuth.context);
    const foreignStatus = await http.request(
      "GET",
      `${prefix}/operations/${challenge.operationId}`,
      auth.token,
    );
    expect(foreignStatus.body).toEqual({
      state: "EXPIRED",
      operationId: challenge.operationId,
    });
    const hidden = await http.request(
      "GET",
      `${prefix}/operations/${challenge.operationId}/challenge`,
      auth.token,
    );
    const absent = await http.request(
      "GET",
      `${prefix}/operations/${randomUUID()}/challenge`,
      auth.token,
    );
    expect(hidden.status).toBe(409);
    expect(absent.status).toBe(hidden.status);
    expect(hidden.body.code).toBe(absent.body.code);
    await seed(f.userId, "STATUS", 176);
    expect(
      (
        await http.request(
          "GET",
          `${prefix}/operations/${randomUUID()}`,
          auth.token,
        )
      ).status,
    ).toBe(200);
    for (const path of [
      `operations/${challenge.operationId}`,
      `operations/${challenge.operationId}/challenge`,
      `exceptions/${randomUUID()}`,
    ])
      limited(await http.request("GET", `${prefix}/${path}`, auth.token));
    expect(
      (
        await http.request(
          "GET",
          `${prefix}/operations/${challenge.operationId}`,
          foreignAuth.token,
        )
      ).status,
    ).toBe(200);
  });
  it.each([undefined, "invalid"])(
    "fails safely for limiter secret %s without allocating; OFF legacy Shift is independent",
    async (secret) => {
      const f = await db.createFixture();
      const auth = await db.session(f.userId);
      const before = await allocations();
      const previous = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
      try {
        if (secret === undefined)
          delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
        else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = secret;
        const result = await http.request(
          "POST",
          `${prefix}/challenges`,
          auth.token,
          {
            action: "START",
            targetLocationId: f.locationId,
            operationId: randomUUID(),
          },
        );
        expect(result.status).toBe(503);
        expect(result.body.code).toBe("ANTI_ABUSE_UNAVAILABLE");
        expect(result.headers.get("cache-control")).toBe("no-store");
        expect(await allocations()).toEqual(before);
        expect(
          (
            await http.request("POST", "/v1/staff/shifts/start", auth.token, {
              targetLocationId: f.locationId,
            })
          ).status,
        ).toBe(200);
      } finally {
        process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = previous!;
      }
    },
  );
  it("fails closed on a real limiter INSERT privilege failure", async () => {
    const f = await db.createFixture();
    const auth = await db.session(f.userId);
    const before = await allocations();
    await db.adminPool.query(
      `REVOKE INSERT(scope,key_hash,state) ON anti_abuse_events FROM "${db.runtimeRole}"`,
    );
    try {
      const result = await http.request(
        "POST",
        `${prefix}/challenges`,
        auth.token,
        {
          action: "START",
          targetLocationId: f.locationId,
          operationId: randomUUID(),
        },
      );
      expect(result.status).toBe(503);
      expect(result.body.code).toBe("ANTI_ABUSE_UNAVAILABLE");
      expect(await allocations()).toEqual(before);
    } finally {
      await db.adminPool.query(
        `GRANT INSERT(scope,key_hash,state) ON anti_abuse_events TO "${db.runtimeRole}"`,
      );
    }
  });
});
