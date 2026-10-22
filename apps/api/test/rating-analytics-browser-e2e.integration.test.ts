import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { StaffAuthOriginPolicy } from "../src/modules/auth/staff-auth.origin";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { DashboardApiTestContext } from "./dashboard-api-test-context";
import { analyticsSeedSession } from "./dashboard-analytics-seed";

const dashboardOrigin = "http://localhost:3003";
const requireFromDashboard = createRequire(resolve(process.cwd(), "../dashboard/package.json"));

// Explicit opt-in: requires the already-built, isolated #313 Next preview on 3003.
describe.runIf(process.env.ISSUE313_BROWSER_E2E === "1")(
  "Issue #313 real persisted Guest rating to Dashboard browser",
  () => {
    it("renders the genuine authenticated 1-of-2, five-star visit cohort", async () => {
      const fixture = new DashboardApiTestContext("issue313_browser");
      const report: Record<string, unknown> = {
        dashboardOrigin,
        api: "isolated Nest with disposable PostgreSQL",
        startedUtc: new Date().toISOString(),
        requests: [],
        result: "RUNNING",
      };
      const evidenceDirectory = resolve(process.cwd(), "../../tmp");
      const { chromium } = requireFromDashboard("@playwright/test");
      let browser: { close(): Promise<void> } | undefined;
      try {
        await fixture.setupApi();
        const apiOrigin = (fixture as unknown as { baseUrl: string }).baseUrl;
        const app = (fixture as unknown as {
          app: { get(token: unknown): unknown };
        }).app;
        (app.get(StaffAuthOriginPolicy) as {
          allowedOrigins: Set<string>;
        }).allowedOrigins.add(dashboardOrigin);

        const location = await fixture.managerFixture();
        const staff = await fixture.createStaff(location);
        const completedAt = new Date(Date.now() - 20_000).toISOString();
        const createdAt = new Date(Date.now() - 80_000).toISOString();
        const ratedSession = await analyticsSeedSession(fixture, {
          state: "COMPLETED",
          completedAtIso: completedAt,
          createdAtIso: createdAt,
        });
        await analyticsSeedSession(fixture, {
          state: "COMPLETED",
          completedAtIso: completedAt,
          createdAtIso: createdAt,
        });
        const guestToken = randomBytes(32).toString("base64url");
        await fixture.adminPool.query(
          `UPDATE valet_sessions
             SET customer_access_token_hash=$2,
                 customer_access_expires_at=clock_timestamp()+interval '1 day'
           WHERE id=$1`,
          [ratedSession, hashGuestAccessToken(guestToken)],
        );
        const posted = await fixture.request("POST", "/v1/guest/session/rating", {
          authorization: `Bearer ${guestToken}`,
          body: { rating: 5 },
        });
        expect(posted.status).toBe(200);
        const persisted = await fixture.adminPool.query<{ rating: number }>(
          "SELECT rating FROM guest_ratings WHERE valet_session_id=$1",
          [ratedSession],
        );
        expect(persisted.rows).toEqual([{ rating: 5 }]);
        report.persistedGuestRating = true;

        const launched = await chromium.launch({ headless: true });
        browser = launched;
        const context = await launched.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        await page.route("**/v1/**", async (route: {
          request(): { url(): string; method(): string };
          fetch(options: { url: string; maxRedirects: number }): Promise<{
            status(): number;
          }>;
          fulfill(options: { response: unknown }): Promise<void>;
        }) => {
          const source = new URL(route.request().url());
          const response = await route.fetch({
            url: apiOrigin + source.pathname + source.search,
            maxRedirects: 0,
          });
          (report.requests as Array<Record<string, unknown>>).push({
            method: route.request().method(),
            path: source.pathname.replace(
              /[a-f\d]{8}-[a-f\d-]{27,}/gi, "{scope}",
            ),
            status: response.status(),
            realBackend: true,
          });
          await route.fulfill({ response });
        });
        await page.goto(dashboardOrigin + "/analytics", {
          waitUntil: "domcontentloaded",
        });
        await page.getByLabel("Email").fill(staff.email);
        await page.getByLabel("Password").fill(staff.password);
        await page.getByRole("button", { name: "Sign in" }).click();
        await page.getByRole("heading", {
          name: /Choose your authorized workspace/,
        }).waitFor();
        report.workspaceOrganizations = await page.locator(
          'section[data-authority="LOCATION_MANAGER"] button',
        ).allTextContents();
        await page.locator(
          'section[data-authority="LOCATION_MANAGER"] button',
        ).first().click();
        const locationChoices = page.locator('section[aria-label="Locations"] button');
        await locationChoices.first().waitFor();
        report.workspaceLocations = await locationChoices.allTextContents();
        await locationChoices.first().click();
        await page.getByTestId("customer-feedback-section").waitFor();
        await page.waitForTimeout(1_500);
        const rendered = await page.getByTestId("customer-feedback-section").innerText();
        report.feedbackText = rendered.slice(0, 1200);
        report.feedbackState = await page.getByTestId("feedback-state").getAttribute(
          "data-state",
        );
        report.metricCards = await page.getByTestId("analytics-metric-card").count();
        report.chartPanels = await page.getByTestId("analytics-chart-panel").count();
        report.afterLoginPath = new URL(page.url()).pathname;
        await page.screenshot({
          path: resolve(evidenceDirectory, "issue-313-live-browser-proof.png"),
          fullPage: true,
          animations: "disabled",
        });
        const ratingsReads = (report.requests as Array<{
          path: string;
          status: number;
        }>).filter((item) => /analytics\/ratings/.test(item.path));
        report.managementReads = ratingsReads;
        expect(ratingsReads.some((item) => item.status === 200)).toBe(true);
        expect(rendered).toMatch(/50%|50\.0|٥٠/);
        expect(rendered).toMatch(/5\.0|٥/);
        report.result = "PASS";
      } catch (error) {
        report.result = "FAIL";
        report.error = String(error instanceof Error ? error.message : error);
        throw error;
      } finally {
        await browser?.close().catch(() => undefined);
        await fixture.teardownApi().catch((error: unknown) => {
          report.cleanupFailure = String(error);
        });
        report.endedUtc = new Date().toISOString();
        writeFileSync(
          resolve(evidenceDirectory, "issue-313-live-browser-proof.json"),
          JSON.stringify(report, null, 2),
        );
      }
    }, 150_000);
  },
);
