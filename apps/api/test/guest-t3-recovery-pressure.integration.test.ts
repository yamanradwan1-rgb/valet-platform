import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import {
  GuestBrowserSessionTestContext,
  mutationHeaders,
} from "./guest-browser-session-test-context";
import {
  authorizeBrowser,
  prepareConflict,
} from "./guest-browser-session-context-switch-test-helpers";

describe("T3 authorized recovery under hostile same-NAT pressure", () => {
  const context = new GuestBrowserSessionTestContext(
    "t3_recovery_source_pressure",
  );
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);
  beforeEach(() => context.adminPool.query("DELETE FROM anti_abuse_events"));
  async function exhaustSource() {
    const key = new AntiAbuseKeyDeriver().derive(
      "v1:guest-client-address",
      "127.0.0.1",
    );
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) SELECT $1,$2,'PENDING' FROM generate_series(1,60)",
      [key.scope, key.keyHash],
    );
  }

  it("recovers consumed bearer exchange through independently authorized cookie", async () => {
    const visit = await context.createVisit();
    const browser = await context.enrollDirect();
    await context.exchangeDirect(visit.token, browser);
    await exhaustSource();
    const recovered = await context.request(
      "POST",
      "/v1/guest/browser-session/exchange",
      {
        authorization: "Bearer " + visit.token,
        body: {},
        headers: mutationHeaders,
        cookies: [
          context.browserCookie(browser.browser),
          context.enrollmentCookie(browser.enrollment),
        ],
      },
    );
    expect(recovered.status).toBe(204);
    expect(await context.resolveDirect(browser.browser)).toBe("OK:ACTIVE");
    expect(
      (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM anti_abuse_events WHERE scope='v1:guest-client-address'",
        )
      ).rows[0].count,
    ).toBe(60);
  });

  it.each(["same organization", "cross organization"])(
    "recovers a lost committed %s switch and rejects wrong receipt",
    async (kind) => {
      const source = await authorizeBrowser(context);
      const target =
        kind === "same organization"
          ? await context.createSiblingVisit(source.visit)
          : await context.createVisit();
      const transition = await prepareConflict(context, source, target);
      const cookies = [
        context.browserCookie(source.browser),
        context.enrollmentCookie(transition.enrollment),
        context.pendingBrowserCookie(transition.pendingBrowser),
      ];
      const switched = await context.request(
        "POST",
        "/v1/guest/browser-session/switch",
        {
          authorization: "Bearer " + target.token,
          body: {},
          cookies,
          headers: mutationHeaders,
        },
      );
      expect(switched).toMatchObject({
        status: 200,
        body: { result: "SWITCHED" },
      });
      await exhaustSource();
      const retry = await context.request(
        "POST",
        "/v1/guest/browser-session/switch",
        {
          authorization: "Bearer " + target.token,
          body: {},
          cookies,
          headers: mutationHeaders,
        },
      );
      expect(retry).toMatchObject({
        status: 200,
        body: { result: "RECOVERED" },
      });
      const reconciled = await context.request(
        "POST",
        "/v1/guest/browser-session/switch/reconcile",
        {
          body: {},
          cookies,
          headers: mutationHeaders,
        },
      );
      expect(reconciled).toMatchObject({
        status: 200,
        body: { result: "RECOVERED" },
      });
      const wrong = await context.request(
        "POST",
        "/v1/guest/browser-session/switch/reconcile",
        {
          body: {},
          headers: mutationHeaders,
          cookies: [
            context.browserCookie(source.browser),
            context.enrollmentCookie("vge1." + "Z".repeat(43)),
            context.pendingBrowserCookie(transition.pendingBrowser),
          ],
        },
      );
      expect(wrong.status).toBe(429);
      expect(wrong.headers.get("retry-after")).toMatch(/^[1-9][0-9]*$/);
      expect(await context.resolveDirect(source.browser)).toBe(
        "INVALID_ACCESS",
      );
      expect(await context.resolveDirect(transition.pendingBrowser)).toBe(
        "OK:ACTIVE",
      );
      expect(
        (
          await context.adminPool.query(
            "SELECT count(*)::int AS count FROM guest_browser_sessions WHERE valet_session_id=$1",
            [target.sessionId],
          )
        ).rows[0].count,
      ).toBe(1);
    },
  );
});
