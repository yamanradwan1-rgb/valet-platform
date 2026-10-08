import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { countClassifiedGuest } from "../src/modules/anti-abuse/classified-guest-counter";
import { guestRequestPolicy } from "../src/modules/guest-access/guest-request-policy";
import {
  GuestBrowserSessionTestContext,
  mutationHeaders,
} from "./guest-browser-session-test-context";

describe("T3 exact class boundaries, aggregate and rolling-version compatibility", () => {
  const context = new GuestBrowserSessionTestContext("t3_class_boundaries");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);

  it.each(["B", "C", "D"] as const)(
    "allows 2x envelope then blocks %s with concurrent exact enforcement",
    async (requestClass) => {
      const key = new AntiAbuseKeyDeriver().derive(
        "v1:guest-token",
        randomBytes(32).toString("base64url"),
      );
      const limit = guestRequestPolicy.classes[requestClass];
      for (let index = 0; index < limit - 1; index += 1) {
        expect(
          (
            await inPostgresTransaction(context.runtimePool, (transaction) =>
              countClassifiedGuest(transaction, key, requestClass, limit, 864),
            )
          ).id,
        ).toBeDefined();
      }
      const outcomes = await Promise.all(
        [1, 2].map(() =>
          inPostgresTransaction(context.runtimePool, (transaction) =>
            countClassifiedGuest(transaction, key, requestClass, limit, 864),
          ),
        ),
      );
      expect(outcomes.filter((result) => result.id !== undefined)).toHaveLength(
        1,
      );
      expect(
        outcomes.find((result) => result.id === undefined)?.retryAfter,
      ).toBeGreaterThan(0);
      const rows = await context.adminPool.query(
        "SELECT count(*)::int AS count FROM anti_abuse_events WHERE key_hash=$1",
        [key.keyHash],
      );
      expect(rows.rows[0].count).toBe(limit);
    },
  );

  it("charges authorized NONE reconciliation to lifecycle B, not the anonymous allocation pool", async () => {
    const visit = await context.createVisit();
    const browser = await context.enrollDirect();
    await context.exchangeDirect(visit.token, browser);
    for (let index = 0; index < 32; index += 1) {
      expect(
        (
          await context.request(
            "POST",
            "/v1/guest/browser-session/switch/reconcile",
            {
              body: {},
              headers: mutationHeaders,
              cookies: [context.browserCookie(browser.browser)],
            },
          )
        ).status,
      ).toBe(200);
    }
    const blocked = await context.request(
      "POST",
      "/v1/guest/browser-session/switch/reconcile",
      {
        body: {},
        headers: mutationHeaders,
        cookies: [context.browserCookie(browser.browser)],
      },
    );
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("GUEST_ACCESS_RATE_LIMITED");
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          cookies: [context.browserCookie(browser.browser)],
        })
      ).status,
    ).toBe(200);
  });

  it("carries the read ceiling across bootstrap consumption, cookie transport and staff reissue", async () => {
    const visit = await context.createVisit();
    const keys = new AntiAbuseKeyDeriver();
    const key = keys.derive("v1:guest-token", visit.token);
    const group = keys.derive("v1:guest-token", `visit:${visit.sessionId}`);
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state,request_class,group_key_hash) SELECT $1,$2,'COUNTED','A',$3 FROM generate_series(1,783)",
      [key.scope, key.keyHash, group.keyHash],
    );
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          authorization: `Bearer ${visit.token}`,
        })
      ).status,
    ).toBe(200);
    const browser = await context.enrollDirect();
    const exchanged = await context.request(
      "POST",
      "/v1/guest/browser-session/exchange",
      {
        body: {},
        headers: mutationHeaders,
        authorization: `Bearer ${visit.token}`,
        cookies: [
          context.browserCookie(browser.browser),
          context.enrollmentCookie(browser.enrollment),
        ],
      },
    );
    expect(exchanged.status).toBe(204);
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          cookies: [context.browserCookie(browser.browser)],
        })
      ).status,
    ).toBe(429);
    const token = await context.rotate(visit);
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          authorization: `Bearer ${token}`,
        })
      ).status,
    ).toBe(429);
  });

  it("shares legacy N-1 and classified N events without resetting or multiplying quotas", async () => {
    const service = new AntiAbuseService(
      context.runtimePool,
      new AntiAbuseKeyDeriver(),
    );
    const key = service.key(
      "v1:guest-token",
      randomBytes(32).toString("base64url"),
    );
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) SELECT $1,$2,'COUNTED' FROM generate_series(1,179)",
      [key.scope, key.keyHash],
    );
    // N-1's existing scope/window/threshold, followed by N's additive classified event.
    expect((await service.count(key, 180)).allowed).toBe(true);
    expect((await service.count(key, 180)).allowed).toBe(false);
    expect(
      (
        await inPostgresTransaction(context.runtimePool, (transaction) =>
          countClassifiedGuest(transaction, key, "A", 784, 864),
        )
      ).id,
    ).toBeDefined();
    expect((await service.count(key, 180)).allowed).toBe(false);
    expect(
      (
        await inPostgresTransaction(context.runtimePool, (transaction) =>
          countClassifiedGuest(transaction, key, "B", 32, 864),
        )
      ).id,
    ).toBeUndefined();
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state,request_class) SELECT $1,$2,'COUNTED','A' FROM generate_series(1,683)",
      [key.scope, key.keyHash],
    );
    expect(
      (
        await inPostgresTransaction(context.runtimePool, (transaction) =>
          countClassifiedGuest(transaction, key, "D", 16, 864),
        )
      ).id,
    ).toBeUndefined();
    expect(
      (
        await inPostgresTransaction(context.runtimePool, (transaction) =>
          countClassifiedGuest(transaction, key, "A", 1000, 864),
        )
      ).id,
    ).toBeUndefined();
  });

  it("uses the event expiry that actually clears an oversubscribed class, with bounded DB-time cooldown", async () => {
    const key = new AntiAbuseKeyDeriver().derive(
      "v1:guest-token",
      randomBytes(32).toString("base64url"),
    );
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state,request_class,group_key_hash,occurred_at) SELECT $1,$2,'COUNTED','C',$2,clock_timestamp()-((900-value)::text || ' seconds')::interval FROM generate_series(1,50) value",
      [key.scope, key.keyHash],
    );
    const decision = await inPostgresTransaction(
      context.runtimePool,
      (transaction) => countClassifiedGuest(transaction, key, "C", 32, 864),
    );
    expect(decision.id).toBeUndefined();
    expect(decision.retryAfter).toBeGreaterThanOrEqual(18);
    expect(decision.retryAfter).toBeLessThanOrEqual(20);
  });
});
