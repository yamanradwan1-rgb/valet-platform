import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  applyAnalyticsPeriod,
  mixedEvidenceCompanyAnalytics,
} from "./support/md05-analytics-fixtures";
import {
  companyAnalyticsPath,
  locationIntelligenceReply,
  locationPaths,
} from "./support/md05-intelligence-fixtures";
import {
  companyReportPaths,
  companyReportReply,
  locationReportPaths,
  locationReportReply,
  REPORT_SELECTORS,
} from "./support/md05-reports-fixtures";
import {
  expectArtifact,
  installBinary,
  loadReport,
} from "./support/md05-reports-e2e-helpers";
import {
  proveReportsLoadingSkeleton,
  proveReportsReferenceGeometry,
} from "./support/md05-reports-visual-proof";

async function selectCompany(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

async function selectLocation(page: Page, path: string, manager: boolean) {
  await page.goto(path);
  await signInOnCurrentPage(page, manager ? "manager@example.com" : "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

async function applyOverviewPeriod(page: Page) {
  await page.getByTestId("md05-overview-page").locator('button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill("2026-09-01");
  await dialog.getByLabel("To").fill("2026-09-07");
  await dialog.getByRole("button", { name: "Apply" }).click();
}

test("Company MD-05 closure keeps authoritative mixed evidence, report preview/export, and four-route navigation", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === companyAnalyticsPath) return { body: mixedEvidenceCompanyAnalytics(request) };
      return companyReportReply(path, request);
    },
  });
  await fixture.install(page);
  const binary = await installBinary(page, () => ({ kind: "artifact", format: "CSV", company: true }));
  await selectCompany(page, "/analytics");
  await applyAnalyticsPeriod(page);
  await page.getByText("Analytics source evidence", { exact: true }).click();
  await expect(page.getByText("12.345 JOD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("45.670 USD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/America\/New_York/u)).toBeVisible();
  expect(fixture.count(locationPaths.operations)).toBe(0);
  expect(fixture.count(locationPaths.financial)).toBe(0);
  expect(fixture.count(locationPaths.incidents)).toBe(0);
  expect(fixture.count(locationPaths.kpis)).toBe(0);

  const nav = page.getByRole("navigation", { name: "Management navigation" });
  for (const label of ["Overview", "Payments", "Analytics", "Reports"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Validations" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Reports" }).click();
  const dialog = await loadReport(page, "DAILY");
  await expect(dialog.getByText(ORG_A.organizationId, { exact: true })).toBeVisible();
  await expect(dialog.getByText("7.000", { exact: true }).first()).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expectArtifact(
    await downloadPromise,
    "CSV",
    `company-report-daily-${REPORT_SELECTORS.daily}.csv`,
  );
  expect(binary.posts).toBe(1);
  for (const path of Object.values(locationReportPaths)) expect(fixture.count(path)).toBe(0);
});

test("CA exact Location closure uses Location intelligence and Location reports only", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) =>
      locationIntelligenceReply(path, request, 8) ?? locationReportReply(path, request, 8),
  });
  await fixture.install(page);
  await selectLocation(page, "/overview", false);
  await applyOverviewPeriod(page);
  await expect(page.getByText("8", { exact: true }).first()).toBeVisible();
  expect(fixture.count(locationPaths.operations)).toBe(1);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  await page.getByRole("navigation", { name: "Management navigation" })
    .getByRole("link", { name: "Reports" }).click();
  const dialog = await loadReport(page, "WEEKLY");
  await expect(dialog.getByText(LOCATION_A.timezone, { exact: true })).toBeVisible();
  expect(fixture.count(locationReportPaths.weekly)).toBe(1);
  for (const path of Object.values(companyReportPaths)) expect(fixture.count(path)).toBe(0);
});

test("LM exact Location closure has no Company route or Company report fallback", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) =>
      locationIntelligenceReply(path, request, 6) ?? locationReportReply(path, request, 6),
  });
  await fixture.install(page);
  await selectLocation(page, "/analytics", true);
  await applyAnalyticsPeriod(page);
  await expect(page.getByText("6", { exact: true }).first()).toBeVisible();
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  await page.getByRole("navigation", { name: "Management navigation" })
    .getByRole("link", { name: "Reports" }).click();
  const dialog = await loadReport(page, "MONTHLY");
  await expect(dialog.getByText(LOCATION_A.locationId, { exact: true })).toBeVisible();
  expect(fixture.count(locationReportPaths.monthly)).toBe(1);
  for (const path of Object.values(companyReportPaths)) expect(fixture.count(path)).toBe(0);
});

test("no standalone Validations destination survives final MD-05", async ({ page }) => {
  const response = await page.goto("/validations");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("button", { name: /Approve|Reject/u })).toHaveCount(0);
});

test("Reports reproduces frozen geometry across theme, locale, and width", async ({ page }) => {
  await proveReportsReferenceGeometry(page);
});

test("Reports preserves the frozen eight-row loading skeleton geometry", async ({ page }) => {
  await proveReportsLoadingSkeleton(page);
});
