import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { GuestBrowserSessionTestContext } from "./guest-browser-session-test-context";
import { startGuestBrowserPeerApp } from "./guest-browser-session-peer-app";

describe("T3 two Nest instances, durable class budgets and hotel NAT", () => {
  const context = new GuestBrowserSessionTestContext("t3_two_instances");
  let peer: Awaited<ReturnType<typeof startGuestBrowserPeerApp>>;
  let peerPool: PostgresPool;

  beforeAll(async () => {
    const priorMax = process.env.DATABASE_POOL_MAX;
    process.env.DATABASE_POOL_MAX = "6";
    try {
      await context.setup();
    } finally {
      if (priorMax === undefined) delete process.env.DATABASE_POOL_MAX;
      else process.env.DATABASE_POOL_MAX = priorMax;
    }
    peerPool = createRuntimePostgresPool(context.runtimeUrl, {
      NODE_ENV: "test",
      DATABASE_POOL_MAX: "6",
    });
    peer = await startGuestBrowserPeerApp(peerPool);
  }, 120_000);
  afterAll(async () => {
    await peer?.app.close();
    await peerPool?.end();
    await context.teardown();
  }, 60_000);

  async function read(token: string, remote = false) {
    if (!remote)
      return context.request("GET", "/v1/guest/session", {
        authorization: `Bearer ${token}`,
      });
    const response = await fetch(`${peer.baseUrl}/v1/guest/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      status: response.status,
      headers: response.headers,
      body: (await response.json()) as Record<string, unknown>,
    };
  }

  it("proves 2x two-tab envelope and exact 784 threshold across replicas/restart", async () => {
    const visit = await context.createVisit();
    for (let index = 0; index < 783; index += 1) {
      expect((await read(visit.token, index % 2 === 0)).status).toBe(200);
    }
    const results = await Promise.all([
      read(visit.token),
      read(visit.token, true),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 429]);
    await peer.app.close();
    peer = await startGuestBrowserPeerApp(peerPool);
    const blocked = await read(visit.token, true);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("GUEST_ACCESS_RATE_LIMITED");
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(blocked.headers.get("retry-after"))).toBeLessThanOrEqual(900);
    const events = await context.adminPool.query(
      "SELECT count(*)::int AS count FROM anti_abuse_events WHERE key_hash=$1 AND request_class='A'",
      [new AntiAbuseKeyDeriver().derive("v1:guest-token", visit.token).keyHash],
    );
    expect(events.rows[0].count).toBe(784);
  }, 60_000);

  it("keeps 100 synchronized authorized visits independent of 60 crashed PENDING requests", async () => {
    const first = await context.createVisit();
    const tokens = [first.token];
    for (let index = 1; index < 100; index += 1)
      tokens.push((await context.createSiblingVisit(first)).token);
    const key = new AntiAbuseKeyDeriver().derive(
      "v1:guest-client-address",
      "127.0.0.1",
    );
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) SELECT $1,$2,'PENDING' FROM generate_series(1,60)",
      [key.scope, key.keyHash],
    );
    const latencies: number[] = [];
    const burst = await Promise.all(
      tokens.map(async (token, index) => {
        const started = performance.now();
        const result = await read(token, index % 2 === 0);
        latencies.push(performance.now() - started);
        return result;
      }),
    );
    expect(
      burst.map((result) => result.status).filter((status) => status !== 200),
    ).toEqual([]);
    expect((await read("a".repeat(43), true)).status).toBe(429);
    await context.adminPool.query(
      "UPDATE anti_abuse_events SET occurred_at=clock_timestamp()-interval '16 minutes' WHERE scope='v1:guest-client-address'",
    );
    const hostile = await Promise.all(
      Array.from({ length: 70 }, (_, index) =>
        read(
          Buffer.alloc(32, index + 1).toString("base64url"),
          index % 2 === 0,
        ),
      ),
    );
    expect(hostile.filter((result) => result.status === 401)).toHaveLength(60);
    expect(hostile.filter((result) => result.status === 429)).toHaveLength(10);
    expect((await read(tokens[0]!)).status).toBe(200);
    latencies.sort((a, b) => a - b);
    const evidenceDirectory = resolve(
      process.cwd(),
      "../../tmp/guest-t3-evidence",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(
      resolve(evidenceDirectory, "two-instance.json"),
      JSON.stringify(
        {
          instances: 2,
          poolMaxPerInstance: 6,
          synchronizedAuthorizedVisits: 100,
          crashedPendingSourceReservations: 60,
          legitimate200: burst.filter((result) => result.status === 200).length,
          legitimate429: burst.filter((result) => result.status === 429).length,
          legitimate503: burst.filter((result) => result.status === 503).length,
          hostile401: 60,
          hostile429: 10,
          p50Ms: latencies[49],
          p95Ms: latencies[94],
          p99Ms: latencies[98],
          poolAcquisitionBucketUpperMs: [5, 25, 100, 500, 1000, 2000],
          primary: runtimePoolSnapshot(context.runtimePool),
          peer: runtimePoolSnapshot(peerPool),
          evidence:
            "owned local PostgreSQL/Nest fixture; not staging capacity qualification",
        },
        null,
        2,
      ),
    );
  }, 60_000);

  it("preserves cookie authority and invalidates an admitted generation after reissue", async () => {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          cookies: [context.browserCookie(credentials.browser)],
        })
      ).status,
    ).toBe(200);
    expect((await read(visit.token)).status).toBe(429); // shared hostile NAT remains exhausted
    await context.rotate(visit);
    expect(await context.resolveDirect(credentials.browser)).toBe(
      "INVALID_ACCESS",
    );
  });
});
