import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GuestBrowserSessionService } from "../src/modules/guest-access/guest-browser-session.service";
import {
  GuestBrowserSessionTestContext,
  mutationHeaders,
} from "./guest-browser-session-test-context";

describe("Guest Browser Session T1 lifecycle", () => {
  const context = new GuestBrowserSessionTestContext("lifecycle");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);

  async function browserForVisit() {
    const visit = await context.createVisit();
    const credentials = await context.enrollDirect();
    expect(await context.exchangeDirect(visit.token, credentials)).toBe(
      "AUTHORIZED",
    );
    return { credentials, visit };
  }

  it("resolves active scope and limits completed visits to post-visit scope", async () => {
    const { credentials, visit } = await browserForVisit();
    expect(await context.resolveDirect(credentials.browser, false)).toBe(
      "OK:ACTIVE",
    );
    expect(await context.resolveDirect(credentials.browser, true)).toBe(
      "OK:ACTIVE",
    );

    await context.complete(visit.sessionId);
    expect(await context.resolveDirect(credentials.browser, false)).toBe(
      "INVALID_ACCESS",
    );
    expect(await context.resolveDirect(credentials.browser, true)).toBe(
      "OK:POST_VISIT",
    );

    const read = await context.request("GET", "/v1/guest/session", {
      cookies: [context.browserCookie(credentials.browser)],
    });
    expect(read).toMatchObject({ body: { state: "COMPLETED" }, status: 200 });
  });

  it("denies CANCELLED and completed visits older than 24 hours", async () => {
    const cancelled = await browserForVisit();
    await context.cancel(cancelled.visit.sessionId);
    expect(
      await context.resolveDirect(cancelled.credentials.browser, true),
    ).toBe("INVALID_ACCESS");

    const old = await browserForVisit();
    await context.complete(old.visit.sessionId, 25);
    expect(await context.resolveDirect(old.credentials.browser, true)).toBe(
      "INVALID_ACCESS",
    );
  });

  it("invalidates the prior Browser Session on rotation, revoke, and reissue", async () => {
    const rotated = await browserForVisit();
    await context.rotate(rotated.visit);
    expect(await context.resolveDirect(rotated.credentials.browser)).toBe(
      "INVALID_ACCESS",
    );

    const reissued = await browserForVisit();
    const revokedAt = await context.revoke(reissued.visit);
    expect(await context.resolveDirect(reissued.credentials.browser)).toBe(
      "INVALID_ACCESS",
    );
    const newToken = await context.reissue(reissued.visit, revokedAt);
    expect(await context.resolveDirect(reissued.credentials.browser)).toBe(
      "INVALID_ACCESS",
    );

    const fresh = await context.enrollDirect();
    expect(await context.exchangeDirect(newToken, fresh)).toBe("AUTHORIZED");
    expect(await context.resolveDirect(fresh.browser)).toBe("OK:ACTIVE");
  });

  it("per-browser end access revokes only the current Browser Session", async () => {
    const { credentials, visit } = await browserForVisit();
    await context.endDirect(credentials.browser);
    expect(await context.resolveDirect(credentials.browser)).toBe(
      "INVALID_ACCESS",
    );
    const rotated = await context.rotate(visit);
    const fresh = await context.enrollDirect();
    expect(await context.exchangeDirect(rotated, fresh)).toBe("AUTHORIZED");
  });

  it("restores from persisted authority after application service recreation", async () => {
    const { credentials, visit } = await browserForVisit();
    const recreatedService = new GuestBrowserSessionService();
    const transaction = await context.runtimePool.connect();
    try {
      await transaction.query("BEGIN");
      const restored = await recreatedService.resolveReadInTransaction(
        transaction,
        credentials.browser,
      );
      expect(restored.session.valetSessionId).toBe(visit.sessionId);
      expect(restored.scope).toBe("ACTIVE");
      await transaction.query("COMMIT");
    } finally {
      transaction.release();
    }
  });

  it("requires mutation transport even when the Browser Session cookie is valid", async () => {
    const { credentials } = await browserForVisit();
    const result = await context.request(
      "POST",
      "/v1/guest/browser-session/end",
      {
        body: {},
        cookies: [context.browserCookie(credentials.browser)],
        headers: { ...mutationHeaders, origin: "https://wrong.example.test" },
      },
    );
    expect(result).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
    expect(await context.resolveDirect(credentials.browser)).toBe("OK:ACTIVE");
  });

  it("does not silently replace an ACTIVE Browser Session when a second valid Guest link is opened", async () => {
    const { credentials } = await browserForVisit();
    const nextVisit = await context.createVisit();
    const result = await context.request(
      "POST",
      "/v1/guest/browser-session/enroll",
      {
        body: {},
        cookies: [context.browserCookie(credentials.browser)],
        headers: mutationHeaders,
      },
    );
    expect(result).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    expect(await context.resolveDirect(credentials.browser, true)).toBe("OK:ACTIVE");
    const stillValidSecondLink = await context.request("GET", "/v1/guest/session", {
      authorization: `Bearer ${nextVisit.token}`,
    });
    expect(stillValidSecondLink.status).toBe(200);
  });

  it("does not silently replace a POST_VISIT Browser Session when a second valid Guest link is opened", async () => {
    const { credentials, visit } = await browserForVisit();
    const nextVisit = await context.createVisit();
    await context.complete(visit.sessionId);
    expect(await context.resolveDirect(credentials.browser, true)).toBe(
      "OK:POST_VISIT",
    );
    const result = await context.request(
      "POST",
      "/v1/guest/browser-session/enroll",
      {
        body: {},
        cookies: [context.browserCookie(credentials.browser)],
        headers: mutationHeaders,
      },
    );
    expect(result).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    expect(await context.resolveDirect(credentials.browser, true)).toBe(
      "OK:POST_VISIT",
    );
    const stillValidSecondLink = await context.request("GET", "/v1/guest/session", {
      authorization: `Bearer ${nextVisit.token}`,
    });
    expect(stillValidSecondLink.status).toBe(200);
  });

  it("rejects an unknown shape-valid Browser Session on end-access", async () => {
    const result = await context.request(
      "POST",
      "/v1/guest/browser-session/end",
      {
        body: {},
        cookies: [context.browserCookie(`vgb1.${"Z".repeat(43)}`)],
        headers: mutationHeaders,
      },
    );
    expect(result).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
  });
});
