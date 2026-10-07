import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GUEST_BROWSER_COOKIE,
  GUEST_ENROLLMENT_COOKIE,
} from "../src/modules/guest-access/guest-browser-transport";
import {
  GuestBrowserSessionTestContext,
  cookieValue,
  guestOrigin,
  mutationHeaders,
} from "./guest-browser-session-test-context";

describe("Guest Browser Session T1 HTTP contract", () => {
  const context = new GuestBrowserSessionTestContext("http");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);

  async function enroll() {
    const result = await context.request(
      "POST",
      "/v1/guest/browser-session/enroll",
      {
        body: {},
        headers: mutationHeaders,
      },
    );
    const browser = cookieValue(result.headers, GUEST_BROWSER_COOKIE);
    const enrollment = cookieValue(result.headers, GUEST_ENROLLMENT_COOKIE);
    expect(result.status).toBe(204);
    expect(browser).toMatch(/^vgb1\.[A-Za-z0-9_-]{43}$/);
    expect(enrollment).toMatch(/^vge1\.[A-Za-z0-9_-]{43}$/);
    return { browser: browser!, enrollment: enrollment!, result };
  }

  it("enrolls, exchanges once, restores by cookie, and recovers a lost exchange response", async () => {
    const visit = await context.createVisit();
    const credentials = await enroll();
    const cookies = [
      context.browserCookie(credentials.browser),
      context.enrollmentCookie(credentials.enrollment),
    ];
    const first = await context.request(
      "POST",
      "/v1/guest/browser-session/exchange",
      {
        authorization: `Bearer ${visit.token}`,
        body: {},
        cookies,
        headers: mutationHeaders,
      },
    );
    expect(first.status).toBe(204);
    expect(cookieValue(first.headers, GUEST_ENROLLMENT_COOKIE)).toBe("");

    await context.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_expires_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [visit.sessionId],
    );

    const recovered = await context.request(
      "POST",
      "/v1/guest/browser-session/exchange",
      {
        authorization: `Bearer ${visit.token}`,
        body: {},
        cookies,
        headers: mutationHeaders,
      },
    );
    expect(recovered.status).toBe(204);

    const restored = await context.request("GET", "/v1/guest/session", {
      cookies: [context.browserCookie(credentials.browser)],
    });
    expect(restored).toMatchObject({
      body: { state: "PARKED", valetSessionId: visit.sessionId },
      status: 200,
    });

    const consumedBearer = await context.request("GET", "/v1/guest/session", {
      authorization: `Bearer ${visit.token}`,
    });
    expect(consumedBearer).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
  });

  it("lets an already-issued enrollment finish after new enrollment rollout is disabled", async () => {
    const visit = await context.createVisit();
    const credentials = await enroll();
    process.env.GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED = "false";
    try {
      const exchanged = await context.request(
        "POST",
        "/v1/guest/browser-session/exchange",
        {
          authorization: `Bearer ${visit.token}`,
          body: {},
          cookies: [
            context.browserCookie(credentials.browser),
            context.enrollmentCookie(credentials.enrollment),
          ],
          headers: mutationHeaders,
        },
      );
      expect(exchanged.status).toBe(204);
      expect(await context.resolveDirect(credentials.browser)).toBe("OK:ACTIVE");
    } finally {
      process.env.GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED = "true";
    }
  });

  it("keeps an unconsumed legacy bearer compatible and rejects mixed authority", async () => {
    const visit = await context.createVisit();
    const legacy = await context.request("GET", "/v1/guest/session", {
      authorization: `Bearer ${visit.token}`,
    });
    expect(legacy.status).toBe(200);

    const credentials = await enroll();
    const mixed = await context.request("GET", "/v1/guest/session", {
      authorization: `Bearer ${visit.token}`,
      cookies: [context.browserCookie(credentials.browser)],
    });
    expect(mixed).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });

    const invalidCookieWithBearer = await context.request(
      "GET",
      "/v1/guest/session",
      {
        authorization: `Bearer ${visit.token}`,
        cookies: [context.browserCookie(`vgb1.${"Z".repeat(43)}`)],
      },
    );
    expect(invalidCookieWithBearer.status).toBe(401);
  });

  it.each([
    ["origin", { ...mutationHeaders, origin: "https://foreign.example.test" }],
    ["csrf", { ...mutationHeaders, "x-vaylet-guest-session": "V1" }],
    ["content type", { ...mutationHeaders, "content-type": "text/plain" }],
  ])("rejects a non-exact %s on browser mutations", async (_label, headers) => {
    const result = await context.request(
      "POST",
      "/v1/guest/browser-session/enroll",
      {
        body: {},
        headers,
      },
    );
    expect(result).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
  });

  it("requires exact configured Origin rather than accepting a syntactic sibling", async () => {
    const result = await context.request(
      "POST",
      "/v1/guest/browser-session/enroll",
      {
        body: {},
        headers: { ...mutationHeaders, origin: `${guestOrigin}/` },
      },
    );
    expect(result.status).toBe(400);
  });

  it("does not let enroll replace an existing authority source", async () => {
    const visit = await context.createVisit();
    const result = await context.request(
      "POST",
      "/v1/guest/browser-session/enroll",
      {
        authorization: `Bearer ${visit.token}`,
        body: {},
        headers: mutationHeaders,
      },
    );
    expect(result).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
  });

  it("fails closed on malformed or duplicate Browser cookies during enrollment", async () => {
    for (const cookie of [
      `${GUEST_BROWSER_COOKIE}=malformed`,
      `${GUEST_BROWSER_COOKIE}=vgb1.${"B".repeat(43)}; ${GUEST_BROWSER_COOKIE}=vgb1.${"C".repeat(43)}`,
    ]) {
      const result = await context.request(
        "POST",
        "/v1/guest/browser-session/enroll",
        {
          body: {},
          cookies: [cookie],
          headers: mutationHeaders,
        },
      );
      expect(result).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
    }
  });

  it("marks Browser Session success and error responses no-store", async () => {
    const success = await context.request(
      "POST",
      "/v1/guest/browser-session/enroll",
      {
        body: {},
        headers: mutationHeaders,
      },
    );
    const failure = await context.request(
      "POST",
      "/v1/guest/browser-session/enroll",
      {
        body: {},
        headers: { ...mutationHeaders, "x-vaylet-guest-session": "wrong" },
      },
    );
    for (const result of [success, failure]) {
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(result.headers.get("pragma")).toBe("no-cache");
    }
  });
});
