import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  enterCompanyAnalytics,
  standardCompanyFixture,
} from "./support/md05-analytics-fixtures";
import {
  companyAnalytics,
  companyAnalyticsPath,
  locationIntelligenceReply,
  locationPaths,
  PERIOD_A,
} from "./support/md05-intelligence-fixtures";

async function enterCompany(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

async function applyPeriod(page: Page, from = PERIOD_A.from, to = PERIOD_A.to) {
  await page.locator('[data-testid^="md05-"][data-testid$="-page"] button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill(from);
  await dialog.getByLabel("To").fill(to);
  await dialog.getByRole("button", { name: "Apply" }).click();
}

for (const path of ["/overview", "/payments"] as const) {
  test(`${path} accepts 31 inclusive days and captures the exact Company selector`, async ({ page }) => {
    const seen: string[] = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (requestPath, request) => {
        if (requestPath !== companyAnalyticsPath) return undefined;
        const url = new URL(request.url());
        seen.push(`${url.pathname}${url.search}`);
        return { body: companyAnalytics(request) };
      },
    });
    await fixture.install(page);
    await enterCompany(page, `${path}?from=2026-09-01&to=2026-10-01`);
    await expect.poll(() => seen.length).toBe(1);
    expect(seen).toEqual([`${companyAnalyticsPath}?from=2026-09-01&to=2026-10-01`]);
    for (const locationPath of Object.values(locationPaths)) {
      expect(fixture.count(locationPath)).toBe(0);
    }
  });

  for (const [label, from, to] of [
    ["impossible", "2026-02-30", "2026-03-01"],
    ["reversed", "2026-09-07", "2026-09-01"],
    ["32-day", "2026-09-01", "2026-10-02"],
  ] as const) {
    test(`${path} rejects ${label} direct URL periods before business dispatch`, async ({ page }) => {
      const fixture = new DashboardApiFixture({
        companyOrganizations: [ORG_A],
        companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      });
      await fixture.install(page);
      await enterCompany(page, `${path}?from=${from}&to=${to}`);
      await expect(page.getByText(/Select a period/u).first()).toBeVisible();
      const url = new URL(page.url());
      expect(url.searchParams.get("from")).toBe(from);
      expect(url.searchParams.get("to")).toBe(to);
      expect(fixture.count(companyAnalyticsPath)).toBe(0);
      for (const locationPath of Object.values(locationPaths)) {
        expect(fixture.count(locationPath)).toBe(0);
      }
    });
  }
}

test("LM Overview captures exact current and period Location endpoints", async ({ page }) => {
  const seen: string[] = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (Object.values(locationPaths).includes(path as never)) {
        const url = new URL(request.url());
        seen.push(`${url.pathname}${url.search}`);
      }
      return locationIntelligenceReply(path, request, 8);
    },
  });
  await fixture.install(page);
  await page.goto("/overview");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await applyPeriod(page);
  await expect(page.getByText("8", { exact: true }).first()).toBeVisible();
  for (const path of [locationPaths.operations, locationPaths.incidents, locationPaths.kpis]) {
    expect(seen).toContain(`${path}?from=${PERIOD_A.from}&to=${PERIOD_A.to}`);
  }
  expect(seen.some((url) => url === locationPaths.stateCounts)).toBe(true);
  expect(seen.some((url) => url === locationPaths.queue)).toBe(true);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
});

test("CA Payments captures exact current and period Location endpoints", async ({ page }) => {
  const seen: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === locationPaths.financialOverview || path === locationPaths.financial) {
        const url = new URL(request.url());
        seen.push(`${url.pathname}${url.search}`);
      }
      return locationIntelligenceReply(path, request, 9);
    },
  });
  await fixture.install(page);
  await page.goto("/payments");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await applyPeriod(page);
  await expect(page.getByText("9.000 JOD", { exact: true }).first()).toBeVisible();
  expect(seen).toContain(locationPaths.financialOverview);
  expect(seen).toContain(`${locationPaths.financial}?from=${PERIOD_A.from}&to=${PERIOD_A.to}`);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
});

test("Analytics controlled period editing keeps focus and restores the opener on Escape", async ({ page }) => {
  await standardCompanyFixture().install(page);
  await enterCompanyAnalytics(page);
  const opener = page.getByTestId("analytics-header-selectors")
    .getByRole("button", { name: "Select period" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Select analytics period" });
  const from = dialog.getByLabel("From");
  const to = dialog.getByLabel("To");
  await expect(from).toBeFocused();
  await from.fill(PERIOD_A.from);
  await expect(from).toBeFocused();
  await to.click();
  await expect(to).toBeFocused();
  await to.fill(PERIOD_A.to);
  await expect(to).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("Overview chart textual alternative uses the same returned activity source", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) =>
      path === companyAnalyticsPath ? { body: companyAnalytics(request, 17) } : undefined,
  });
  await fixture.install(page);
  await enterCompany(page, "/overview");
  await applyPeriod(page);
  const table = page.getByTestId("overview-activity-text");
  await expect(table.locator("caption")).toHaveText("Vehicle Activity");
  await expect(table.locator("tbody tr").first().locator("td")).toHaveText([PERIOD_A.from, "17"]);
});
