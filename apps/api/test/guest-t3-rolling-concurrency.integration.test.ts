import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { GuestBrowserSessionTestContext } from "./guest-browser-session-test-context";
import { createT1Controller, startT1Api } from "./guest-t3-baseline-source";
import { startGuestBrowserPeerApp } from "./guest-browser-session-peer-app";
import { GuestT3LegacyCompatibilityFixture } from "./guest-t3-legacy-compatibility-fixture";

describe("T3 N / immutable N-1 two-API coexistence", () => {
  const context = new GuestBrowserSessionTestContext("t3_rolling_api");
  const legacy = new GuestT3LegacyCompatibilityFixture(context);
  let original: Awaited<ReturnType<typeof startT1Api>>;
  let current: Awaited<ReturnType<typeof startGuestBrowserPeerApp>>;
  beforeAll(async () => {
    const priorMode = process.env.GUEST_T3_RATE_POLICY;
    process.env.GUEST_T3_RATE_POLICY = "COMPATIBILITY";
    try {
      await context.setup();
      const originalPool = await legacy.setup();
      original = await startT1Api(
        await createT1Controller(
          originalPool,
          new GuestAccessService(originalPool),
        ),
      );
      current = await startGuestBrowserPeerApp(context.runtimePool);
    } finally {
      if (priorMode === undefined) delete process.env.GUEST_T3_RATE_POLICY;
      else process.env.GUEST_T3_RATE_POLICY = priorMode;
    }
  }, 120_000);
  afterAll(async () => {
    try {
      await original?.app.close();
      await current?.app.close();
    } finally {
      try {
        await legacy.teardown();
      } finally {
        await context.teardown();
      }
    }
  }, 60_000);

  it("keeps historical and classified events visible to both servers, including the exact ceiling", async () => {
    const privileges = await context.adminPool.query<{
      legacy_insert: boolean;
      runtime_insert: boolean;
    }>(
      `SELECT has_column_privilege($1,'public.anti_abuse_events','scope','INSERT') AS legacy_insert,
              has_any_column_privilege($2,'public.anti_abuse_events','INSERT') AS runtime_insert`,
      [legacy.role, context.runtimeRole],
    );
    expect(privileges.rows[0]).toEqual({
      legacy_insert: true,
      runtime_insert: false,
    });
    const visit = await context.createVisit();
    const key = new AntiAbuseKeyDeriver().derive("v1:guest-token", visit.token);
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) SELECT $1,$2,'COUNTED' FROM generate_series(1,179)",
      [key.scope, key.keyHash],
    );
    const read = (baseUrl: string) =>
      fetch(`${baseUrl}/v1/guest/session`, {
        headers: { authorization: `Bearer ${visit.token}` },
      });
    const concurrent = await Promise.all([
      read(original.baseUrl),
      read(current.baseUrl),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 429,
    ]);
    expect((await read(original.baseUrl)).status).toBe(429);
    expect((await read(current.baseUrl)).status).toBe(429);
    const count = (
      await context.adminPool.query(
        "SELECT count(*)::int AS count FROM anti_abuse_events WHERE key_hash=$1 AND state IN ('PENDING','COUNTED')",
        [key.keyHash],
      )
    ).rows[0].count as number;
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state,request_class) SELECT $1,$2,'COUNTED','A' FROM generate_series(1,$3::int)",
      [key.scope, key.keyHash, 784 - count],
    );
    const exhausted = await Promise.all([
      read(original.baseUrl),
      read(current.baseUrl),
    ]);
    expect(exhausted.map((response) => response.status)).toEqual([429, 429]);
    for (const response of exhausted) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(((await response.json()) as { code: string }).code).toBe(
        "GUEST_ACCESS_RATE_LIMITED",
      );
    }
    expect(
      (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM anti_abuse_events WHERE key_hash=$1",
          [key.keyHash],
        )
      ).rows[0].count,
    ).toBe(784);
  });
});
