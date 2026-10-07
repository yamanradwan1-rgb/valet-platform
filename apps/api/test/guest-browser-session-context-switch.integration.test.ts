import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

import {
  GUEST_CONTEXT_COOKIE,
  GUEST_PENDING_BROWSER_COOKIE,
} from "../src/modules/guest-access/guest-browser-context-transport";
import {
  GUEST_BROWSER_COOKIE,
  GUEST_ENROLLMENT_COOKIE,
} from "../src/modules/guest-access/guest-browser-transport";
import {
  GuestBrowserSessionTestContext,
  cookieValue,
  mutationHeaders,
} from "./guest-browser-session-test-context";
import {
  authorizeBrowser,
  prepareConflict,
} from "./guest-browser-session-context-switch-test-helpers";

describe("Guest Browser Session T1 same-browser context switch HTTP contract", () => {
  const context = new GuestBrowserSessionTestContext("context_switch_http");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);

  it("permits the runtime role to prepare a source-bound conflict only through the reviewed function", async () => {
    const source = await authorizeBrowser(context);
    const target = await context.createSiblingVisit(source.visit);
    const enrollment = `vge1.${randomBytes(32).toString("base64url")}`;
    const pendingBrowser = `vgb1.${randomBytes(32).toString("base64url")}`;

    const prepared = await context.runtimePool.query<{
      authority_scope: string | null;
      result_code: string;
    }>(
      `SELECT result_code,authority_scope
       FROM guest_browser_prepare_context($1,$2,$3,$4)`,
      [target.token, source.browser, enrollment, pendingBrowser],
    );

    expect(prepared.rows[0]).toEqual({
      authority_scope: "ACTIVE",
      result_code: "CONTEXT_CONFLICT",
    });
    expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");
  });

  it("treats an already-authorized same-visit link as a no-op without conflict", async () => {
    const source = await authorizeBrowser(context);
    await context.adminPool.query(
      "UPDATE valet_sessions SET customer_access_expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1",
      [source.visit.sessionId],
    );
    const before = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_sessions WHERE valet_session_id=$1",
      [source.visit.sessionId],
    );
    const prepared = await context.request(
      "POST",
      "/v1/guest/browser-session/prepare",
      {
        authorization: `Bearer ${source.visit.token}`,
        body: {},
        cookies: [context.browserCookie(source.browser)],
        headers: mutationHeaders,
      },
    );
    expect(prepared).toMatchObject({ body: { result: "SAME_VISIT" }, status: 200 });
    expect(cookieValue(prepared.headers, GUEST_BROWSER_COOKIE)).toBeUndefined();
    expect(cookieValue(prepared.headers, GUEST_ENROLLMENT_COOKIE)).toBeUndefined();
    expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");
    const after = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_sessions WHERE valet_session_id=$1",
      [source.visit.sessionId],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("returns a verified ACTIVE conflict without mutating either visit before choice", async () => {
    const source = await authorizeBrowser(context);
    const target = await context.createSiblingVisit(source.visit);
    const transition = await prepareConflict(context, source, target);
    expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");
    const targetBearer = await context.request("GET", "/v1/guest/session", {
      authorization: `Bearer ${target.token}`,
    });
    expect(targetBearer.status).toBe(200);
    expect(await context.resolveDirect(transition.pendingBrowser)).toBe(
      "INVALID_ACCESS",
    );

    const bypass = await context.request(
      "POST",
      "/v1/guest/browser-session/exchange",
      {
        authorization: `Bearer ${target.token}`,
        body: {},
        cookies: [
          context.browserCookie(transition.pendingBrowser),
          context.enrollmentCookie(transition.enrollment),
        ],
        headers: mutationHeaders,
      },
    );
    expect(bypass).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    expect(await context.resolveDirect(source.browser)).toBe("OK:ACTIVE");
  });

  it("returns the POST_VISIT conflict variant while preserving the 24-hour source authority", async () => {
    const source = await authorizeBrowser(context);
    const target = await context.createSiblingVisit(source.visit);
    await context.complete(source.visit.sessionId);
    const prepared = await context.request(
      "POST",
      "/v1/guest/browser-session/prepare",
      {
        authorization: `Bearer ${target.token}`,
        body: {},
        cookies: [context.browserCookie(source.browser)],
        headers: mutationHeaders,
      },
    );
    expect(prepared).toMatchObject({
      body: { currentScope: "POST_VISIT", result: "CONTEXT_CONFLICT" },
      status: 200,
    });
    expect(await context.resolveDirect(source.browser, true)).toBe("OK:POST_VISIT");
    expect(
      await context.request("GET", "/v1/guest/session", {
        authorization: `Bearer ${target.token}`,
      }),
    ).toMatchObject({ status: 200 });
  });

  it("switches atomically only after explicit choice and promotes exactly one pending browser context", async () => {
    const source = await authorizeBrowser(context);
    const target = await context.createSiblingVisit(source.visit);
    const transition = await prepareConflict(context, source, target);
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
    expect(switched).toMatchObject({ body: { result: "SWITCHED" }, status: 200 });
    expect(switched.headers.get("cache-control")).toBe("no-store");
    expect(cookieValue(switched.headers, GUEST_BROWSER_COOKIE)).toBe(
      transition.pendingBrowser,
    );
    expect(cookieValue(switched.headers, GUEST_CONTEXT_COOKIE)).toMatch(
      /^vgc1\.[0-9a-f]{32}$/,
    );
    expect(cookieValue(switched.headers, GUEST_ENROLLMENT_COOKIE)).toBe("");
    expect(cookieValue(switched.headers, GUEST_PENDING_BROWSER_COOKIE)).toBe("");
    expect(await context.resolveDirect(source.browser)).toBe("INVALID_ACCESS");
    expect(await context.resolveDirect(transition.pendingBrowser)).toBe("OK:ACTIVE");
    const rows = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_sessions WHERE valet_session_id=$1 AND revoked_at IS NULL",
      [target.sessionId],
    );
    expect(rows.rows[0]?.count).toBe(1);
  });

});
