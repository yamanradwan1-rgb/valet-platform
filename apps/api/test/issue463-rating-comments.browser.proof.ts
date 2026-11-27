import "reflect-metadata";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { acquireIssue463BrowserTarget } from "./issue463-browser-target";
import { seedIssue463Browser } from "./issue463-browser-seed";
import { startIssue463BrowserProxy } from "./issue463-browser-proxy.mjs";
import { startIssue463BrowserApps, unusedIssue463Port } from "./issue463-browser-apps";

const requireDashboard = createRequire(resolve(process.cwd(), "../dashboard/package.json"));
const enabled = process.env.ISSUE463_BROWSER_QA === "I_OWN_DISPOSABLE_463";

describe.runIf(enabled)("Issue463 owned production browser proof", () => {
  it("persists real Guest text, discloses it through real Manager UI, and never retries a lost commit", async () => {
    const target = await acquireIssue463BrowserTarget();
    try {
      const fixture = await seedIssue463Browser(target);
      const first = await fixture.completedVisit();
      const second = await fixture.completedVisit();
      const lost = await fixture.completedVisit();
      const customerPort = await unusedIssue463Port();
      const dashboardPort = await unusedIssue463Port();
      process.env.GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED = "true";
      process.env.GUEST_AUTH_ALLOWED_ORIGINS = `http://127.0.0.1:${customerPort}`;
      process.env.STAFF_AUTH_ALLOWED_ORIGINS = `http://127.0.0.1:${dashboardPort}`;
      process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
      const { AppModule } = await import("../src/app.module");
      const app = await NestFactory.create(AppModule, {
        logger: false, abortOnError: false, rawBody: true, forceCloseConnections: true,
      });
      try {
        await app.listen(0,"127.0.0.1");
        const address = app.getHttpServer().address() as {port:number};
        const proxy = await startIssue463BrowserProxy(`http://127.0.0.1:${address.port}`);
        try {
          const apps = await startIssue463BrowserApps(proxy.origin,customerPort,dashboardPort);
          try {
            const { chromium } = requireDashboard("@playwright/test");
            const browser = await chromium.launch({headless:true});
            try {
              const comment = "Issue463 synthetic browser proof: exact text.";
              async function rate(visit: typeof first, text: string | null, drop = false) {
                const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});
                try {
                  await context.addInitScript(() => localStorage.setItem("vaylet_guest_locale","en"));
                  const page = await context.newPage();
                  page.setDefaultTimeout(25_000);
                  await page.goto(`${apps.customerOrigin}/#guestToken=${visit.token}`);
                  const rating = page.getByRole("group",{name:"Rate your experience"});
                  await rating.waitFor();
                  await rating.getByRole("button",{name:"5 stars",exact:true}).click();
                  if (text !== null) await page.locator("#rating-comment").fill(text);
                  const before = proxy.observations();
                  if (drop) proxy.armLostRatingResponse();
                  await page.getByRole("button",{name:"Submit rating",exact:true}).click();
                  await page.getByText(drop ? /We cannot confirm whether your rating was recorded/ : "Thanks for your feedback.",{exact:!drop}).waitFor();
                  if (drop) {
                    expect(proxy.observations().droppedSuccessfulResponses).toBe(before.droppedSuccessfulResponses+1);
                    await page.waitForTimeout(2500);
                  }
                  expect(proxy.observations().ratingPosts).toBe(before.ratingPosts+1);
                  const persisted = await target.client.query(`SELECT r.rating,c.comment_text,c.state
                    FROM guest_ratings r LEFT JOIN guest_rating_comments c ON
                    c.organization_id=r.organization_id AND c.location_id=r.location_id AND c.valet_session_id=r.valet_session_id
                    WHERE r.organization_id=$1 AND r.location_id=$2 AND r.valet_session_id=$3`,
                    [fixture.organizationId,fixture.locationId,visit.id]);
                  expect(persisted.rows).toEqual([{rating:5,comment_text:text,state:text===null?null:"PRESENT"}]);
                } finally { await context.close(); }
              }
              await rate(first,comment);
              await rate(second,null);
              await rate(lost,"Issue463 synthetic lost-response proof.",true);
              const context = await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"});
              try {
                await context.addInitScript(() => localStorage.setItem("vaylet_dashboard_locale","en"));
                const page = await context.newPage();
                page.setDefaultTimeout(25_000);
                await page.goto(apps.dashboardOrigin+"/analytics?preset=LAST_30_DAYS");
                await page.getByLabel("Email").fill(fixture.email);
                await page.getByLabel("Password").fill(fixture.password);
                await page.getByRole("button",{name:"Sign in"}).click();
                const organizations = page.locator('section[data-authority="LOCATION_MANAGER"] button');
                await organizations.first().waitFor();
                expect(await organizations.count()).toBe(1);
                await organizations.first().click();
                const locations = page.locator('section[aria-label="Locations"] button');
                await locations.first().waitFor();
                expect(await locations.count()).toBe(1);
                await locations.first().click();
                const feedback = page.getByTestId("customer-feedback-section");
                await feedback.waitFor();
                const toggles = feedback.getByRole("button",{name:/View comment for/});
                await expect.poll(() => toggles.count()).toBe(2);
                const names = await toggles.all();
                let found = false;
                for (const toggle of names) {
                  await toggle.click();
                  if (await feedback.getByText(comment,{exact:true}).isVisible()) {
                    found = true;
                    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
                    await toggle.click();
                    expect(await feedback.getByText(comment,{exact:true}).isVisible()).toBe(false);
                    break;
                  }
                }
                expect(found).toBe(true);
              } finally { await context.close(); }
            } finally { await browser.close(); }
          } finally { await apps.close(); }
        } finally { await proxy.close(); }
      } finally { await app.close(); }
    } finally { await target.close(); }
  }, 900_000);
});
