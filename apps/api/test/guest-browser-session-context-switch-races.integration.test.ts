import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GuestBrowserSessionTestContext,
  type GuestVisit,
} from "./guest-browser-session-test-context";

interface BrowserPair {
  readonly browser: string;
  readonly enrollment: string;
}

const secret = (prefix: "vgb1." | "vge1."): string =>
  `${prefix}${randomBytes(32).toString("base64url")}`;

describe("Guest Browser Session T1 atomic context-switch races", () => {
  const context = new GuestBrowserSessionTestContext("context_switch_races");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);

  async function authorize(visit: GuestVisit): Promise<BrowserPair> {
    const pair = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, pair)).toBe("AUTHORIZED");
    return pair;
  }

  async function prepare(
    target: GuestVisit,
    sourceBrowser: string,
  ): Promise<BrowserPair> {
    const transition = {
      browser: secret("vgb1."),
      enrollment: secret("vge1."),
    };
    const result = await context.runtimePool.query<{ result_code: string }>(
      `SELECT result_code
       FROM guest_browser_prepare_context($1,$2,$3,$4)`,
      [target.token, sourceBrowser, transition.enrollment, transition.browser],
    );
    expect(result.rows[0]?.result_code).toBe("CONTEXT_CONFLICT");
    return transition;
  }

  async function switchDirect(
    targetToken: string,
    sourceBrowser: string,
    transition: BrowserPair,
  ): Promise<string> {
    const result = await context.runtimePool.query<{ result_code: string }>(
      `SELECT result_code
       FROM guest_browser_switch_context($1,$2,$3,$4)`,
      [targetToken, sourceBrowser, transition.enrollment, transition.browser],
    );
    return result.rows[0]?.result_code ?? "MISSING";
  }

  async function waitForPrepareLock(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const waiting = await context.adminPool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM pg_stat_activity
          WHERE datname=current_database()
            AND query LIKE '%guest_browser_prepare_context%'
            AND wait_event_type='Lock'`,
      );
      if ((waiting.rows[0]?.count ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Context prepare did not reach the expected lock wait.");
  }

  it("serializes switch against source revoke/reissue without resurrecting the old Browser Session", async () => {
    const source = await context.createVisit();
    const target = await context.createSiblingVisit(source);
    const sourceBrowser = await authorize(source);
    const transition = await prepare(target, sourceBrowser.browser);

    const [switchResult, reissuedToken] = await Promise.all([
      switchDirect(target.token, sourceBrowser.browser, transition),
      (async () => {
        const revokedAt = await context.revoke(source);
        return context.reissue(source, revokedAt);
      })(),
    ]);

    expect(["SWITCHED", "INVALID_ACCESS"]).toContain(switchResult);
    expect(reissuedToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await context.resolveDirect(sourceBrowser.browser)).toBe("INVALID_ACCESS");
    if (switchResult === "SWITCHED") {
      expect(await context.resolveDirect(transition.browser)).toBe("OK:ACTIVE");
    } else {
      expect(await context.resolveDirect(transition.browser)).toBe("INVALID_ACCESS");
      const targetBearer = await context.request("GET", "/v1/guest/session", {
        authorization: `Bearer ${target.token}`,
      });
      expect(targetBearer.status).toBe(200);
    }
  });

  it("rechecks the target bearer hash after a prepare lock wait", async () => {
    const source = await context.createVisit();
    const target = await context.createSiblingVisit(source);
    const sourceBrowser = await authorize(source);
    const transition = {
      browser: secret("vgb1."),
      enrollment: secret("vge1."),
    };
    const before = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_enrollments",
    );
    const rotation = await context.adminPool.connect();
    try {
      await rotation.query("BEGIN");
      await rotation.query(
        `UPDATE valet_sessions
            SET customer_access_token_hash=guest_browser_hash_secret($2),
                customer_access_expires_at=clock_timestamp()+interval '24 hours',
                updated_at=clock_timestamp()
          WHERE id=$1`,
        [target.sessionId, "Q".repeat(43)],
      );

      const preparing = context.runtimePool.query<{ result_code: string }>(
        `SELECT result_code
           FROM guest_browser_prepare_context($1,$2,$3,$4)`,
        [target.token, sourceBrowser.browser, transition.enrollment, transition.browser],
      );
      await waitForPrepareLock();
      await rotation.query("COMMIT");
      const prepared = await preparing;
      expect(prepared.rows[0]?.result_code).toBe("INVALID_ACCESS");
    } catch (error) {
      await rotation.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      rotation.release();
    }

    expect(await context.resolveDirect(sourceBrowser.browser)).toBe("OK:ACTIVE");
    const after = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_enrollments",
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("serializes switch against target revoke/reissue and never promotes a stale target generation", async () => {
    const source = await context.createVisit();
    const target = await context.createSiblingVisit(source);
    const sourceBrowser = await authorize(source);
    const transition = await prepare(target, sourceBrowser.browser);

    const [switchResult, targetReissued] = await Promise.all([
      switchDirect(target.token, sourceBrowser.browser, transition),
      (async () => {
        const revokedAt = await context.revoke(target);
        return context.reissue(target, revokedAt);
      })(),
    ]);

    expect(["SWITCHED", "INVALID_ACCESS"]).toContain(switchResult);
    expect(targetReissued).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await context.resolveDirect(transition.browser)).toBe("INVALID_ACCESS");
    const fresh = await context.enrollDirect();
    expect(await context.exchangeDirect(targetReissued, fresh)).toBe("AUTHORIZED");
    expect(await context.resolveDirect(fresh.browser)).toBe("OK:ACTIVE");
    expect(await context.resolveDirect(sourceBrowser.browser)).toBe(
      switchResult === "SWITCHED" ? "INVALID_ACCESS" : "OK:ACTIVE",
    );
  });

  it("serializes source completion against switch without losing atomicity", async () => {
    const source = await context.createVisit();
    const target = await context.createSiblingVisit(source);
    const sourceBrowser = await authorize(source);
    const transition = await prepare(target, sourceBrowser.browser);

    const [switchResult] = await Promise.all([
      switchDirect(target.token, sourceBrowser.browser, transition),
      context.complete(source.sessionId),
    ]);

    expect(switchResult).toBe("SWITCHED");
    expect(await context.resolveDirect(sourceBrowser.browser, true)).toBe(
      "INVALID_ACCESS",
    );
    expect(await context.resolveDirect(transition.browser)).toBe("OK:ACTIVE");
  });

  it("serializes target completion against switch and converges to post-visit scope", async () => {
    const source = await context.createVisit();
    const target = await context.createSiblingVisit(source);
    const sourceBrowser = await authorize(source);
    const transition = await prepare(target, sourceBrowser.browser);

    const [switchResult] = await Promise.all([
      switchDirect(target.token, sourceBrowser.browser, transition),
      context.complete(target.sessionId),
    ]);

    expect(["SWITCHED", "INVALID_ACCESS"]).toContain(switchResult);
    if (switchResult === "SWITCHED") {
      expect(await context.resolveDirect(sourceBrowser.browser, true)).toBe(
        "INVALID_ACCESS",
      );
      expect(await context.resolveDirect(transition.browser, true)).toBe(
        "OK:POST_VISIT",
      );
    } else {
      expect(await context.resolveDirect(sourceBrowser.browser, true)).toBe(
        "OK:ACTIVE",
      );
    }
  });

  it("allows only one competing target to take a single source browser context", async () => {
    const source = await context.createVisit();
    const firstTarget = await context.createSiblingVisit(source);
    const secondTarget = await context.createSiblingVisit(source);
    const sourceBrowser = await authorize(source);
    const first = await prepare(firstTarget, sourceBrowser.browser);
    const second = await prepare(secondTarget, sourceBrowser.browser);

    const outcomes = await Promise.all([
      switchDirect(firstTarget.token, sourceBrowser.browser, first),
      switchDirect(secondTarget.token, sourceBrowser.browser, second),
    ]);
    expect(outcomes.filter((value) => value === "SWITCHED")).toHaveLength(1);
    expect(outcomes.filter((value) => value === "INVALID_ACCESS")).toHaveLength(1);
    expect(await context.resolveDirect(sourceBrowser.browser)).toBe("INVALID_ACCESS");
    const targetResolves = await Promise.all([
      context.resolveDirect(first.browser),
      context.resolveDirect(second.browser),
    ]);
    expect(targetResolves.filter((value) => value === "OK:ACTIVE")).toHaveLength(1);
  });

  it("rejects the old tab secret after commit while shared-cookie tabs converge on the promoted context", async () => {
    const source = await context.createVisit();
    const target = await context.createSiblingVisit(source);
    const sourceBrowser = await authorize(source);
    const transition = await prepare(target, sourceBrowser.browser);
    expect(await switchDirect(target.token, sourceBrowser.browser, transition)).toBe(
      "SWITCHED",
    );

    const staleTab = await context.request("GET", "/v1/guest/session", {
      cookies: [context.browserCookie(sourceBrowser.browser)],
    });
    expect(staleTab).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    const sharedTabs = await Promise.all([
      context.request("GET", "/v1/guest/session", {
        cookies: [context.browserCookie(transition.browser)],
      }),
      context.request("GET", "/v1/guest/session", {
        cookies: [context.browserCookie(transition.browser)],
      }),
    ]);
    expect(sharedTabs.map((result) => result.status)).toEqual([200, 200]);
    expect(sharedTabs.map((result) => result.body.valetSessionId)).toEqual([
      target.sessionId,
      target.sessionId,
    ]);
  });
});
