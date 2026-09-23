import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  companyAnalytics,
  companyAnalyticsPath,
  currentFinancialOverview,
  financialCurrency,
  locationIntelligenceReply,
  locationPaths,
  PERIOD_A,
  PERIOD_B,
  requestPeriod,
} from "./support/md05-intelligence-fixtures";
import {
  proveOverviewReferenceGeometry,
  provePaymentsReferenceGeometry,
} from "./support/md05-visual-proof";

async function enterCompany(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

async function enterManager(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

async function applyPeriod(page: Page, from: string, to: string) {
  await page
    .locator('[data-testid^="md05-"][data-testid$="-page"] button[aria-haspopup="dialog"]')
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill(from);
  await dialog.getByLabel("To").fill(to);
  await dialog.getByRole("button", { name: "Apply" }).click();
}

function noLocationFanout(fixture: DashboardApiFixture) {
  for (const path of Object.values(locationPaths)) expect(fixture.count(path)).toBe(0);
}

test("CA Company Overview uses only all-locations analytics and never Location fan-out", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) =>
      path === companyAnalyticsPath ? { body: companyAnalytics(request, 17) } : undefined,
  });
  await fixture.install(page);
  await enterCompany(page, "/overview");
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  await applyPeriod(page, PERIOD_A.from, PERIOD_A.to);
  await expect(page.getByText("17", { exact: true }).first()).toBeVisible();
  expect(fixture.count(companyAnalyticsPath)).toBe(1);
  noLocationFanout(fixture);
});

test("Company to Location to Company fences the first stale Company response", async ({ page }) => {
  let companyReads = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === companyAnalyticsPath) {
        companyReads += 1;
        return {
          body: companyAnalytics(request, companyReads === 1 ? 91 : 23),
          ...(companyReads === 1 ? { delayMs: 1_800 } : {}),
        };
      }
      return locationIntelligenceReply(path, request, 6);
    },
  });
  await fixture.install(page);
  await enterCompany(page, "/overview");
  await applyPeriod(page, PERIOD_A.from, PERIOD_A.to);
  await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(1);
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText("6", { exact: true }).first()).toBeVisible();
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("23", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1_900);
  await expect(page.getByText("91", { exact: true })).toHaveCount(0);
  await expect(page.getByText("23", { exact: true }).first()).toBeVisible();
});

test("LM active exact Location Overview uses Location reads and no Company endpoint", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => locationIntelligenceReply(path, request, 8),
  });
  await fixture.install(page);
  await enterManager(page, "/overview");
  await expect(page.getByText("Retrieval queue depth")).toBeVisible();
  await applyPeriod(page, PERIOD_A.from, PERIOD_A.to);
  await expect(page.getByText("8", { exact: true }).first()).toBeVisible();
  expect(fixture.count(locationPaths.stateCounts)).toBeGreaterThan(0);
  expect(fixture.count(locationPaths.operations)).toBe(1);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
});

test("LM active exact Location Payments uses current and period Location reads only", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => locationIntelligenceReply(path, request, 9),
  });
  await fixture.install(page);
  await enterManager(page, "/payments");
  await expect(page.getByText("Current financial projection")).toBeVisible();
  expect(fixture.count(locationPaths.financialOverview)).toBe(1);
  await applyPeriod(page, PERIOD_A.from, PERIOD_A.to);
  await expect(page.getByText("9.000 JOD", { exact: true }).first()).toBeVisible();
  expect(fixture.count(locationPaths.financial)).toBe(1);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
});

test("CA inactive Location is disabled before any Intelligence request", async ({ page }) => {
  const inactive = { ...LOCATION_A, status: "INACTIVE" as const };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [inactive] },
  });
  await fixture.install(page);
  await page.goto("/overview");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByRole("button", { name: /Main Garage/u })).toBeDisabled();
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  noLocationFanout(fixture);
});

for (const [role, context] of [
  ["Supervisor", supervisorContext()],
  ["Employee", employeeContext()],
] as const) {
  test(`${role} direct Overview route exposes no MD-05 business content`, async ({ page }) => {
    const fixture = new DashboardApiFixture({ operationalContexts: [context] });
    await fixture.install(page);
    await page.goto("/overview");
    await signInOnCurrentPage(page, `${role.toLowerCase()}@example.com`);
    await expect(page.getByTestId("md05-overview-page")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
    noLocationFanout(fixture);
  });
}

test("unauthenticated Guest/general direct Payments route exposes no MD-05 content", async ({ page }) => {
  const fixture = new DashboardApiFixture();
  await fixture.install(page);
  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("md05-payments-page")).toHaveCount(0);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  noLocationFanout(fixture);
});

test("explicit period A to B fences a late period A Payments result", async ({ page }) => {
  const seen: string[] = [];
  let currentReads = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === locationPaths.financialOverview) {
        currentReads += 1;
        if (currentReads === 2) {
          return { body: currentFinancialOverview("41.111"), delayMs: 700 };
        }
        return {
          body: currentFinancialOverview(currentReads >= 3 ? "52.222" : "10.000"),
        };
      }
      if (path === locationPaths.financial) {
        const period = requestPeriod(request);
        seen.push(period.from);
        const reply = locationIntelligenceReply(path, request, period.from === PERIOD_A.from ? 41 : 52)!;
        return period.from === PERIOD_A.from ? { ...reply, delayMs: 700 } : reply;
      }
      return locationIntelligenceReply(path, request);
    },
  });
  await fixture.install(page);
  await enterManager(page, "/payments");
  await applyPeriod(page, PERIOD_A.from, PERIOD_A.to);
  await expect.poll(() => seen).toContain(PERIOD_A.from);
  await applyPeriod(page, PERIOD_B.from, PERIOD_B.to);
  await expect(page.getByText("52.000 JOD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("52.222 JOD", { exact: true })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("41.000 JOD", { exact: true })).toHaveCount(0);
  await expect(page.getByText("41.111 JOD", { exact: true })).toHaveCount(0);
  expect(seen).toEqual([PERIOD_A.from, PERIOD_B.from]);
  expect(currentReads).toBeGreaterThanOrEqual(3);
});

test("Payments keeps JOD/USD separate and renders null rates as unavailable", async ({ page }) => {
  const currencies = [
    financialCurrency("JOD", "12.345", { nullRates: true }),
    financialCurrency("USD", "45.670"),
  ];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) =>
      path === companyAnalyticsPath ? { body: companyAnalytics(request, 7, currencies) } : undefined,
  });
  await fixture.install(page);
  await enterCompany(page, "/payments");
  await applyPeriod(page, PERIOD_A.from, PERIOD_A.to);
  await expect(page.getByText("12.345 JOD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("45.670 USD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(3);
  await expect(page.getByText(/0(?:\.00)?% JOD/u)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Validation/u })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve|Reject/u })).toHaveCount(0);
});

test("there is no standalone validations route", async ({ page }) => {
  const response = await page.goto("/validations");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("button", { name: /Approve|Reject/u })).toHaveCount(0);
});

test("Arabic Payments keeps bidi values, keyboard period flow, and narrow composition", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) =>
      path === companyAnalyticsPath ? { body: companyAnalytics(request) } : undefined,
  });
  await fixture.install(page);
  await enterCompany(page, "/payments");
  await page.setViewportSize({ width: 480, height: 900 });
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const opener = page.getByRole("button", { name: "اختيار الفترة" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "اختيار فترة التحليلات المالية" });
  const from = dialog.getByLabel("من");
  const to = dialog.getByLabel("إلى");
  await expect(from).toBeFocused();
  await from.fill(PERIOD_A.from);
  await to.fill(PERIOD_A.to);
  await from.focus();
  await page.keyboard.press("Shift+Tab");
  const apply = dialog.getByRole("button", { name: "تطبيق" });
  await expect(apply).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "المدفوعات" })).toBeVisible();
  await expect(page.locator("bdi[dir='ltr']").filter({ hasText: "12.345 JOD" }).first()).toBeVisible();
  const summary = page.getByTestId("md05-payments-page").locator('[class*="summaryGrid"]');
  await expect.poll(async () =>
    (await summary.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length)),
  ).toBe(1);
});

test("Overview frozen geometry holds in EN/AR desktop and narrow", async ({ page }) => {
  await proveOverviewReferenceGeometry(page);
});

test("Payments frozen geometry holds in EN/AR desktop and narrow", async ({ page }) => {
  await provePaymentsReferenceGeometry(page);
});
