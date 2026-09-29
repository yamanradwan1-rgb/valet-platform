import { expect, test, type Page } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  companyAnalytics, companyAnalyticsPath, locationIntelligenceReply,
  locationPaths, PERIOD_A, PERIOD_B, requestPeriod,
} from "./support/md05-intelligence-fixtures";

async function enterCompany(page: Page, path = "/overview") {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

for (const [name, query] of [
  ["missing side", "from=2026-09-01"],
  ["malformed date", "from=2026-09-01&to=2026-09-31"],
  ["reversed range", "from=2026-09-07&to=2026-09-01"],
  ["over 31 inclusive days", "from=2026-09-01&to=2026-10-02"],
] as const) {
  test(`${name} URL period makes zero Overview intelligence requests`, async ({ page }) => {
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    });
    await fixture.install(page);
    await enterCompany(page, `/overview?${query}`);
    await expect(page.getByRole("heading", { name: "Vehicle Activity" })).toBeVisible();
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
    expect(fixture.count(locationPaths.operations)).toBe(0);
  });
}

async function applyPeriod(page: Page, period: { readonly from: string; readonly to: string }) {
  await page.locator('[data-testid="md05-overview-page"] button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill(period.from);
  await dialog.getByLabel("To").fill(period.to);
  await dialog.getByRole("button", { name: "Apply" }).click();
}

test("Company Overview shows exact source metrics and timezone coverage without raw boundaries", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== companyAnalyticsPath) return undefined;
      const source = companyAnalytics(request, 17);
      const first = source.summary.coverage.timezoneBoundaries[0]!;
      return { body: {
        ...source,
        summary: {
          ...source.summary,
          coverage: {
            ...source.summary.coverage,
            timezoneBoundaries: [
              first,
              { ...first, timezone: "Asia/Dubai", locationCount: 1, activeLocationCount: 1,
                inactiveLocationCount: 0, periodStartUtc: "2026-08-31T20:00:00.000Z" },
            ],
          },
          operational: {
            ...source.summary.operational,
            metrics: {
              ...source.summary.operational.metrics,
              retrievalWait: {
                ...source.summary.operational.metrics.retrievalWait,
                averageSeconds: "640.000",
              },
            },
          },
        },
      } };
    },
  });
  await fixture.install(page);
  await enterCompany(page);
  await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(1);
  await applyPeriod(page, PERIOD_A);
  const root = page.getByTestId("md05-overview-page");
  await expect(root.getByText("17", { exact: true }).first()).toBeVisible();
  await expect(root.getByText("83.33%")).toBeVisible();
  await expect(root.getByText("10m 40s")).toBeVisible();
  await expect(root.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(root.getByText("Asia/Amman")).toBeVisible();
  await expect(root.getByText("Asia/Dubai")).toBeVisible();
  await expect(root.getByText(/2026-08-31T20:00/u)).toHaveCount(0);
  await expect(root.getByRole("img", { name: "Vehicle Activity" })).toBeVisible();
  await expect(root.getByTestId("overview-activity-text").locator("tbody tr")).toHaveCount(1);
  expect(fixture.count(companyAnalyticsPath)).toBe(2);
  expect(fixture.count(locationPaths.operations)).toBe(0);
  await page.getByRole("button", { name: "Language" }).click();
  const cards = root.locator('[class*="metricCard"]');
  await expect(cards.first().locator('[class*="metricValue"]')).toContainText("١٧");
  await expect(cards.nth(1).locator('[class*="metricValue"]')).toContainText("٨٣٫٣٣");
});

test("null evidence stays unavailable while measured zero and empty activity stay truthful", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== companyAnalyticsPath) return undefined;
      const source = companyAnalytics(request, 0);
      return { body: {
        ...source,
        summary: {
          ...source.summary,
          operational: {
            ...source.summary.operational,
            carsHandledPerDay: [],
            metrics: {
              ...source.summary.operational.metrics,
              retrievalWait: { sampleCount: 0, averageSeconds: null, contributingLocationCount: 0 },
            },
          },
          kpis: {
            ...source.summary.kpis,
            slaCompliance: {
              ...source.summary.kpis.slaCompliance,
              numerator: 0, denominator: 0, percentage: null,
              missingTargetCount: 2, invalidOrMissingIntervalCount: 2,
              requestCount: 4,
            },
          },
        },
      } };
    },
  });
  await fixture.install(page);
  await enterCompany(page);
  await applyPeriod(page, PERIOD_A);
  const cards = page.getByTestId("md05-overview-page").locator('[class*="metricCard"]');
  await expect(cards.nth(0).locator('[class*="metricValue"]')).toHaveText("0");
  await expect(cards.nth(1).locator('[class*="metricValue"]')).toHaveText("Unavailable");
  await expect(cards.nth(1).getByText("2 no target")).toBeVisible();
  await expect(cards.nth(1).getByText("2 invalid")).toBeVisible();
  await expect(cards.nth(2).locator('[class*="metricValue"]')).toHaveText("Unavailable");
  await expect.poll(() => cards.evaluateAll((nodes) => nodes.map((node) =>
    Math.round(node.getBoundingClientRect().height),
  ))).toEqual([136, 136, 136, 136]);
  await expect(page.getByText("No cars were handled in this returned period cohort.")).toBeVisible();
  await expect(page.getByTestId("overview-activity-text")).toHaveCount(0);
});

test("Location current summary humanizes queue age and localizes known states", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === locationPaths.queue
      ? { body: { depth: 2, oldestAgeSeconds: "4027197.232" } }
      : locationIntelligenceReply(path, request),
  });
  await fixture.install(page);
  await page.goto("/overview");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText("46d 14h")).toBeVisible();
  await expect(page.getByText("Awaiting parking")).toBeVisible();
  await expect(page.getByText("AWAITING_PARKING")).toHaveCount(0);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("بانتظار الركن")).toBeVisible();
  await expect(page.getByText("AWAITING_PARKING")).toHaveCount(0);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
});

test("Company Admin exact Location uses bounded Location reads for a valid period", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => locationIntelligenceReply(path, request, 8),
  });
  await fixture.install(page);
  await enterCompany(page);
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await applyPeriod(page, PERIOD_A);
  await expect(page.getByTestId("md05-overview-page").locator('[class*="metricCard"]').first())
    .toContainText("8");
  expect(fixture.count(locationPaths.operations)).toBe(2);
  expect(fixture.count(locationPaths.incidents)).toBe(2);
  expect(fixture.count(locationPaths.kpis)).toBe(2);
  expect(fixture.count(locationPaths.queue)).toBeGreaterThan(0);
  expect(fixture.count(locationPaths.stateCounts)).toBeGreaterThan(0);
  expect(fixture.count(companyAnalyticsPath)).toBe(1);
});

test("late period A cannot replace current Company period B", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== companyAnalyticsPath) return undefined;
      const first = requestPeriod(request).from === PERIOD_A.from;
      return {
        body: companyAnalytics(request, first ? 41 : 52),
        ...(first ? { delayMs: 700 } : {}),
      };
    },
  });
  await fixture.install(page);
  await enterCompany(page);
  await applyPeriod(page, PERIOD_A);
  await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(2);
  await applyPeriod(page, PERIOD_B);
  const cards = page.getByTestId("md05-overview-page").locator('[class*="metricCard"]');
  await expect(cards.first().locator('[class*="metricValue"]')).toHaveText("52");
  await page.waitForTimeout(800);
  await expect(cards.first().locator('[class*="metricValue"]')).toHaveText("52");
  expect(fixture.count(companyAnalyticsPath)).toBe(3);
});

test("a pending Company result cannot reappear after sign-out", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === companyAnalyticsPath
      ? { body: companyAnalytics(request, 41), delayMs: 700 }
      : undefined,
  });
  await fixture.install(page);
  await enterCompany(page);
  await applyPeriod(page, PERIOD_A);
  await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(2);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
  await expect(page.getByText("41", { exact: true })).toHaveCount(0);
});

test("a new period read failure clears prior metrics and retries explicitly", async ({ page }) => {
  let periodBReads = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== companyAnalyticsPath) return undefined;
      if (requestPeriod(request).from === PERIOD_A.from) {
        return { body: companyAnalytics(request, 17) };
      }
      if (requestPeriod(request).from !== PERIOD_B.from) {
        return { body: companyAnalytics(request, 7) };
      }
      periodBReads += 1;
      return periodBReads === 1
        ? { status: 503, body: { error: "temporary failure" } }
        : { body: companyAnalytics(request, 52) };
    },
  });
  await fixture.install(page);
  await enterCompany(page);
  await applyPeriod(page, PERIOD_A);
  const cards = page.getByTestId("md05-overview-page").locator('[class*="metricCard"]');
  await expect(cards.first().locator('[class*="metricValue"]')).toHaveText("17");
  await applyPeriod(page, PERIOD_B);
  await expect(page.getByRole("button", { name: "Retry" }).first()).toBeVisible();
  await expect(cards.first().locator('[class*="metricValue"]')).toHaveText("Unavailable");
  await expect(page.getByText("17", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(cards.first().locator('[class*="metricValue"]')).toHaveText("52");
  expect(fixture.count(companyAnalyticsPath)).toBe(4);
});
