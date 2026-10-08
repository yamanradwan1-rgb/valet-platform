import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import {
  GuestBrowserSessionTestContext,
  type BrowserCredentials,
} from "./guest-browser-session-test-context";
import {
  startGuestBrowserPeerApp,
  type GuestBrowserPeerApp,
} from "./guest-browser-session-peer-app";

describe("Guest T4 application-owned HA compatibility", () => {
  const context = new GuestBrowserSessionTestContext("t4_ha_application");
  const priorRatePolicy = process.env.GUEST_T3_RATE_POLICY;
  let peer: GuestBrowserPeerApp;
  let peerPool: PostgresPool;

  beforeAll(async () => {
    process.env.GUEST_T3_RATE_POLICY = "COMPATIBILITY";
    await context.setup();
    peerPool = createRuntimePostgresPool(context.runtimeUrl);
    peer = await startGuestBrowserPeerApp(peerPool);
  }, 120_000);

  afterAll(async () => {
    await peer?.app.close();
    await peerPool?.end();
    await context.teardown();
    if (priorRatePolicy === undefined) delete process.env.GUEST_T3_RATE_POLICY;
    else process.env.GUEST_T3_RATE_POLICY = priorRatePolicy;
  }, 60_000);

  async function restartPeer(): Promise<void> {
    await peer.app.close();
    await peerPool.end();
    peerPool = createRuntimePostgresPool(context.runtimeUrl);
    peer = await startGuestBrowserPeerApp(peerPool);
  }

  async function peerRead(options: {
    readonly browser?: string;
    readonly token?: string;
  }) {
    const headers: Record<string, string> = {};
    if (options.browser !== undefined) {
      headers.cookie = context.browserCookie(options.browser);
    }
    if (options.token !== undefined) {
      headers.authorization = `Bearer ${options.token}`;
    }
    const response = await fetch(`${peer.baseUrl}/v1/guest/session`, {
      headers,
    });
    const text = await response.text();
    return {
      body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
      headers: response.headers,
      status: response.status,
    };
  }

  async function bindBrowser(): Promise<{
    credentials: BrowserCredentials;
    sessionId: string;
    token: string;
  }> {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
    return { credentials, sessionId: visit.sessionId, token: visit.token };
  }

  it("keeps Browser Session authority non-sticky across replicas and a fresh pool restart", async () => {
    const bound = await bindBrowser();
    const primary = await context.request("GET", "/v1/guest/session", {
      cookies: [context.browserCookie(bound.credentials.browser)],
    });
    const secondary = await peerRead({ browser: bound.credentials.browser });

    expect(primary).toMatchObject({
      body: { state: "PARKED", valetSessionId: bound.sessionId },
      status: 200,
    });
    expect(secondary).toMatchObject({
      body: { state: "PARKED", valetSessionId: bound.sessionId },
      status: 200,
    });

    await restartPeer();
    const afterRestart = await peerRead({ browser: bound.credentials.browser });
    expect(afterRestart).toMatchObject({
      body: { state: "PARKED", valetSessionId: bound.sessionId },
      status: 200,
    });
  });

  it("rejects stale and revoked generations on either replica and after restart", async () => {
    const visit = await context.createVisit();
    const first = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, first)).toBe("AUTHORIZED");
    expect((await peerRead({ browser: first.browser })).status).toBe(200);

    const rotatedToken = await context.rotate(visit);
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          cookies: [context.browserCookie(first.browser)],
        })
      ).status,
    ).toBe(401);
    expect((await peerRead({ browser: first.browser })).status).toBe(401);

    const second = await context.enrollDirect();
    expect(await context.exchangeDirect(rotatedToken, second)).toBe(
      "AUTHORIZED",
    );
    expect((await peerRead({ browser: second.browser })).status).toBe(200);

    const revokedAt = await context.revoke(visit);
    expect((await peerRead({ browser: second.browser })).status).toBe(401);
    await restartPeer();
    expect((await peerRead({ browser: second.browser })).status).toBe(401);

    const reissuedToken = await context.reissue(visit, revokedAt);
    expect((await peerRead({ browser: first.browser })).status).toBe(401);
    expect((await peerRead({ browser: second.browser })).status).toBe(401);

    const third = await context.enrollDirect();
    expect(await context.exchangeDirect(reissuedToken, third)).toBe(
      "AUTHORIZED",
    );
    expect((await peerRead({ browser: third.browser })).status).toBe(200);
  });

  it("shares the COMPATIBILITY 180-event floor across replicas and restart", async () => {
    const visit = await context.createVisit();
    for (let index = 0; index < 179; index += 1) {
      const response =
        index % 2 === 0
          ? await context.request("GET", "/v1/guest/session", {
              authorization: `Bearer ${visit.token}`,
            })
          : await peerRead({ token: visit.token });
      expect(response.status).toBe(200);
    }

    const boundary = await Promise.all([
      context.request("GET", "/v1/guest/session", {
        authorization: `Bearer ${visit.token}`,
      }),
      peerRead({ token: visit.token }),
    ]);
    expect(boundary.map((result) => result.status).sort()).toEqual([200, 429]);

    const key = new AntiAbuseKeyDeriver().derive(
      "v1:guest-token",
      visit.token,
    ).keyHash;
    const persisted = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM anti_abuse_events WHERE key_hash=$1 AND request_class='A'",
      [key],
    );
    expect(persisted.rows[0]?.count).toBe(180);

    await restartPeer();
    const blocked = await peerRead({ token: visit.token });
    expect(blocked).toMatchObject({
      body: { code: "GUEST_ACCESS_RATE_LIMITED" },
      status: 429,
    });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  }, 60_000);

  it("keeps rollback-era unclassified limiter history conservative in COMPATIBILITY", async () => {
    const visit = await context.createVisit();
    const key = new AntiAbuseKeyDeriver().derive("v1:guest-token", visit.token);
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) SELECT $1,$2,'COUNTED' FROM generate_series(1,180)",
      [key.scope, key.keyHash],
    );

    expect((await peerRead({ token: visit.token })).status).toBe(429);
    await restartPeer();
    expect((await peerRead({ token: visit.token })).status).toBe(429);
  });
});
