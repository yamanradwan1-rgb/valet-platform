import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GuestBrowserSessionTestContext,
  cookieValue,
  mutationHeaders,
} from "./guest-browser-session-test-context";
import { GUEST_BROWSER_COOKIE } from "../src/modules/guest-access/guest-browser-transport";

// Opt in only against this task's locally running production Customer build.
const enabled = process.env.CUSTOMER_RATING_BROWSER_QA === "1";
describe.skipIf(!enabled)(
  "#312 production Chromium + real Nest/PostgreSQL authority",
  () => {
    const database = new GuestBrowserSessionTestContext(
      "customer_rating_browser",
    );
    let proxy: Server;
    let posts = 0;
    const target = "http://127.0.0.1:3312";
    const requireFromDashboard = createRequire(
      resolve(process.cwd(), "../dashboard/package.json"),
    );
    const { chromium } = requireFromDashboard("@playwright/test");

    beforeAll(async () => {
      await database.setup();
      proxy = createServer((req, res) => {
        void (async () => {
          if (req.url?.includes("/rating") && req.method === "POST") posts++;
          const result = await database.request(
            req.method ?? "GET",
            req.url ?? "/",
            {
              cookies:
                req.headers.cookie?.split(";").map((value) => value.trim()) ??
                [],
            },
          );
          res.writeHead(result.status, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(result.body));
        })().catch(() => {
          res.writeHead(503);
          res.end("{}");
        });
      });
      await new Promise<void>((done) => proxy.listen(3311, "127.0.0.1", done));
    }, 120_000);
    afterAll(async () => {
      if (proxy) await new Promise<void>((done) => proxy.close(() => done()));
      await database.teardown();
    }, 60_000);

    it("live completion, cold restore, dismissal refresh, manual reentry, expiry and missing authority", async () => {
      const visit = await database.createVisit("PARKED");
      const credentials = await database.enrollDirect();
      const exchange = await database.request(
        "POST",
        "/v1/guest/browser-session/exchange",
        {
          authorization: `Bearer ${visit.token}`,
          body: {},
          headers: mutationHeaders,
          cookies: [
            database.browserCookie(credentials.browser),
            database.enrollmentCookie(credentials.enrollment),
          ],
        },
      );
      expect(exchange.status).toBe(204);
      const markerName = "__Host-vaylet_guest_context";
      const marker = cookieValue(exchange.headers, markerName);
      const browser = await chromium.launch({ headless: false });
      try {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          serviceWorkers: "block",
        });
        await context.addCookies([
          {
            name: GUEST_BROWSER_COOKIE,
            value: credentials.browser,
            domain: "127.0.0.1",
            path: "/",
            secure: true,
            httpOnly: true,
            sameSite: "Lax",
          },
          ...(marker
            ? [
                {
                  name: markerName,
                  value: marker,
                  domain: "127.0.0.1",
                  path: "/",
                  secure: true,
                  sameSite: "Lax",
                },
              ]
            : []),
        ]);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error: Error) => errors.push(error.message));
        await page.goto(target);
        await page
          .getByText("Toyota Camry", { exact: false })
          .first()
          .waitFor();
        await database.complete(visit.sessionId);
        await page.evaluate("window.dispatchEvent(new Event('focus'))");
        const rating = page.getByRole("group", {
          name: "Rate your experience",
        });
        await rating.waitFor({ timeout: 25_000 });
        expect(posts).toBe(0);
        expect(await page.locator('[aria-pressed="true"]').count()).toBe(0);
        expect(
          await page
            .getByRole("button", { name: "Submit rating", exact: true })
            .isDisabled(),
        ).toBe(true);
        await page.reload();
        await rating.waitFor(); // un-dismissed completed cold restore
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await page.reload();
        await page
          .getByRole("button", { name: "Payment summary", exact: true })
          .waitFor();
        expect(await rating.count()).toBe(0);
        await page
          .getByRole("button", { name: "Rate your experience", exact: true })
          .click();
        await rating.waitFor();
        await page.keyboard.press("Tab");
        expect(await page.evaluate("document.activeElement?.tagName")).toBe(
          "BUTTON",
        );
        expect(posts).toBe(0);
        await database.complete(visit.sessionId, 25);
        await page.reload();
        await page
          .getByText("Valet session unavailable", { exact: true })
          .waitFor();
        expect(await rating.count()).toBe(0);
        await context.clearCookies();
        await page.reload();
        await page
          .getByText("Valet session unavailable", { exact: true })
          .waitFor();
        expect(errors).toEqual([]);
        expect(posts).toBe(0);
        await context.close();
      } finally {
        await browser.close();
      }
    }, 90_000);
  },
);
