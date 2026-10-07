import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GUEST_BROWSER_COOKIE } from "../src/modules/guest-access/guest-browser-transport";
import {
  GuestBrowserSessionTestContext,
  cookieValue,
  mutationHeaders,
} from "./guest-browser-session-test-context";
import {
  authorizeBrowser,
  prepareConflict,
} from "./guest-browser-session-context-switch-test-helpers";

describe("Guest Browser Session T1 context switch recovery and validation", () => {
  const context = new GuestBrowserSessionTestContext("context_switch_recovery");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);

  it("recovers a committed switch after a lost response without a duplicate Browser Session", async () => {
    const source = await authorizeBrowser(context);
    const target = await context.createVisit();
    const transition = await prepareConflict(context, source, target);
    const staleCookieJar = [
      context.browserCookie(source.browser),
      context.enrollmentCookie(transition.enrollment),
      context.pendingBrowserCookie(transition.pendingBrowser),
    ];
    const committed = await context.request(
      "POST",
      "/v1/guest/browser-session/switch",
      {
        authorization: `Bearer ${target.token}`,
        body: {},
        cookies: staleCookieJar,
        headers: mutationHeaders,
      },
    );
    expect(committed).toMatchObject({ body: { result: "SWITCHED" }, status: 200 });
    await context.adminPool.query(
      `UPDATE guest_browser_enrollments
       SET created_at=clock_timestamp()-interval '2 minutes',
           expires_at=clock_timestamp()-interval '1 minute'
       WHERE enrollment_token_hash=guest_browser_hash_secret($1)`,
      [transition.enrollment],
    );

    const recovered = await context.request(
      "POST",
      "/v1/guest/browser-session/switch",
      {
        authorization: `Bearer ${target.token}`,
        body: {},
        cookies: staleCookieJar,
        headers: mutationHeaders,
      },
    );
    expect(recovered).toMatchObject({ body: { result: "RECOVERED" }, status: 200 });

    const reloadRecovered = await context.request(
      "POST",
      "/v1/guest/browser-session/switch/reconcile",
      { body: {}, cookies: staleCookieJar, headers: mutationHeaders },
    );
    expect(reloadRecovered).toMatchObject({
      body: { result: "RECOVERED" },
      status: 200,
    });
    expect(reloadRecovered.headers.get("cache-control")).toBe("no-store");
    expect(cookieValue(reloadRecovered.headers, GUEST_BROWSER_COOKIE)).toBe(
      transition.pendingBrowser,
    );
    const count = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_sessions WHERE valet_session_id=$1",
      [target.sessionId],
    );
    expect(count.rows[0]?.count).toBe(1);
    expect(await context.resolveDirect(source.browser)).toBe("INVALID_ACCESS");
    expect(
      await context.request("GET", "/v1/guest/session", {
        cookies: [context.browserCookie(transition.pendingBrowser)],
      }),
    ).toMatchObject({ body: { valetSessionId: target.sessionId }, status: 200 });
  });

  it("rejects an expired prepared switch before commit while preserving source and target", async () => {
    const source = await authorizeBrowser(context);
    const target = await context.createSiblingVisit(source.visit);
    const transition = await prepareConflict(context, source, target);
    await context.adminPool.query(
      `UPDATE guest_browser_enrollments
       SET created_at=clock_timestamp()-interval '2 minutes',
           expires_at=clock_timestamp()-interval '1 minute'
       WHERE enrollment_token_hash=guest_browser_hash_secret($1)`,
      [transition.enrollment],
    );

    const switched = await context.request(
      "POST",
      "/v1/guest/browser-session/switch",
      {
        authorization: `Bearer ${target.token}`,
        body: {},
        cookies: [
          context.browserCookie(source.browser),
          context.enrollmentCookie(transition.enrollment),
          context.pendingBrowserCookie(transition.pendingBrowser),
        ],
        headers: mutationHeaders,
      },
    );
    expect(switched).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");
    expect(await context.resolveDirect(transition.pendingBrowser)).toBe(
      "INVALID_ACCESS",
    );
    expect(
      await context.request("GET", "/v1/guest/session", {
        authorization: `Bearer ${target.token}`,
      }),
    ).toMatchObject({ status: 200 });
  });

  it("treats an uncommitted reload reconciliation as a no-op and leaves the source authoritative", async () => {
    const source = await authorizeBrowser(context);
    const target = await context.createSiblingVisit(source.visit);
    const transition = await prepareConflict(context, source, target);
    const reconciled = await context.request(
      "POST",
      "/v1/guest/browser-session/switch/reconcile",
      {
        body: {},
        cookies: [
          context.browserCookie(source.browser),
          context.enrollmentCookie(transition.enrollment),
          context.pendingBrowserCookie(transition.pendingBrowser),
        ],
        headers: mutationHeaders,
      },
    );
    expect(reconciled).toMatchObject({ body: { result: "NONE" }, status: 200 });
    expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");
  });

  it.each(["invalid", "expired", "revoked"] as const)(
    "rejects a cross-organization %s target bearer while preserving current authority",
    async (kind) => {
      const source = await authorizeBrowser(context);
      const target = await context.createVisit();
      const authorizationToken =
        kind === "invalid" ? "Z".repeat(43) : target.token;
      if (kind === "expired") {
        await context.adminPool.query(
          "UPDATE valet_sessions SET customer_access_expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",
          [target.sessionId],
        );
      } else if (kind === "revoked") {
        await context.revoke(target);
      }
      const prepared = await context.request(
        "POST",
        "/v1/guest/browser-session/prepare",
        {
          authorization: `Bearer ${authorizationToken}`,
          body: {},
          cookies: [context.browserCookie(source.browser)],
          headers: mutationHeaders,
        },
      );
      expect(prepared).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
      expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");
      const targetState = await context.adminPool.query<{
        browser_count: number;
        consumed_at: Date | null;
      }>(
        `SELECT session.customer_access_consumed_at AS consumed_at,
                (SELECT count(*)::int FROM guest_browser_sessions AS browser
                  WHERE browser.valet_session_id=session.id) AS browser_count
           FROM valet_sessions AS session WHERE session.id=$1`,
        [target.sessionId],
      );
      expect(targetState.rows[0]).toEqual({ browser_count: 0, consumed_at: null });
    },
  );

  it("applies exact Origin/CSRF mutation fencing to context preparation and switch", async () => {
    const source = await authorizeBrowser(context);
    const target = await context.createSiblingVisit(source.visit);
    const deniedPrepare = await context.request(
      "POST",
      "/v1/guest/browser-session/prepare",
      {
        authorization: `Bearer ${target.token}`,
        body: {},
        cookies: [context.browserCookie(source.browser)],
        headers: { ...mutationHeaders, origin: "https://foreign.example.test" },
      },
    );
    expect(deniedPrepare.status).toBe(400);
    expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");

    const transition = await prepareConflict(context, source, target);
    const deniedSwitch = await context.request(
      "POST",
      "/v1/guest/browser-session/switch",
      {
        authorization: `Bearer ${target.token}`,
        body: {},
        cookies: [
          context.browserCookie(source.browser),
          context.enrollmentCookie(transition.enrollment),
          context.pendingBrowserCookie(transition.pendingBrowser),
        ],
        headers: { ...mutationHeaders, "x-vaylet-guest-session": "V1" },
      },
    );
    expect(deniedSwitch.status).toBe(400);
    expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");
  });
});
