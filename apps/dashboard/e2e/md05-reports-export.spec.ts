import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { staleInactiveExactLocationContext } from "./support/md05-intelligence-fixtures";
import {
  companyReportPaths,
  companyReportReply,
  locationReportPaths,
  locationReportReply,
  REPORT_SELECTORS,
  subscriptionReply,
} from "./support/md05-reports-fixtures";
import {
  changeReportSelector,
  companyLocationReportsFixture,
  companyReportsFixture,
  enterCompanyLocationReports,
  enterCompanyReports,
  enterManagerReports,
  expectArtifact,
  expectExportRequest,
  expectObjectUrlRevoked,
  exportProof,
  installBinary,
  installObjectUrlRevokeProbe,
  loadReport,
  managerReportsFixture,
  proveFinalExportDenials,
  reportPreviewPaths,
} from "./support/md05-reports-e2e-helpers";
import {
  proveAdvisoryDelayDoesNotBlockPreview,
  proveAdvisoryFailureDoesNotBlockPreview,
  proveExportDoubleSubmitIsBlocked,
} from "./support/md05-reports-interaction-proof";

test("CA All Locations previews all fixed kinds through exact Company URLs with no Location fan-out", async ({ page }) => {
  const fixture = companyReportsFixture();
  const seen: string[] = [];
  page.on("request", (request) => {
    if (/\/reports\/(daily|weekly|monthly)$/u.test(new URL(request.url()).pathname)) seen.push(request.url());
  });
  await fixture.install(page);
  await enterCompanyReports(page);
  for (const path of Object.values(companyReportPaths).slice(0, 3)) expect(fixture.count(path)).toBe(0);
  for (const kind of ["DAILY", "WEEKLY", "MONTHLY"] as const) {
    const dialog = await loadReport(page, kind);
    await expect(dialog.getByTestId("report-preview-content")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  }
  expect(seen.map((url) => `${new URL(url).pathname}${new URL(url).search}`)).toEqual([
    `${companyReportPaths.daily}?date=${REPORT_SELECTORS.daily}`,
    `${companyReportPaths.weekly}?weekStart=${REPORT_SELECTORS.weekly}`,
    `${companyReportPaths.monthly}?month=${REPORT_SELECTORS.monthly}`,
  ]);
  for (const path of Object.values(locationReportPaths)) expect(fixture.count(path)).toBe(0);
});

for (const [label, fixtureFactory, enter] of [
  ["CA exact active Location", companyLocationReportsFixture, enterCompanyLocationReports],
  ["LM exact active granted Location", managerReportsFixture, enterManagerReports],
] as const) {
  test(`${label} previews all fixed kinds only through Location routes`, async ({ page }) => {
    const fixture = fixtureFactory();
    const seen: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (/\/reports\/(daily|weekly|monthly)$/u.test(url.pathname)) {
        seen.push(`${url.pathname}${url.search}`);
      }
    });
    await fixture.install(page);
    await enter(page);
    for (const kind of ["DAILY", "WEEKLY", "MONTHLY"] as const) {
      const dialog = await loadReport(page, kind);
      await expect(dialog.getByText(LOCATION_A.timezone, { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Close" }).click();
    }
    expect(fixture.count(locationReportPaths.daily)).toBe(1);
    expect(fixture.count(locationReportPaths.weekly)).toBe(1);
    expect(fixture.count(locationReportPaths.monthly)).toBe(1);
    expect(seen).toEqual([
      `${locationReportPaths.daily}?date=${REPORT_SELECTORS.daily}`,
      `${locationReportPaths.weekly}?weekStart=${REPORT_SELECTORS.weekly}`,
      `${locationReportPaths.monthly}?month=${REPORT_SELECTORS.monthly}`,
    ]);
    for (const path of Object.values(companyReportPaths)) expect(fixture.count(path)).toBe(0);
  });
}

test("inactive revalidation blocks Reports before preview or export", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: staleInactiveExactLocationContext(),
  });
  const binary = await installBinary(page, () => ({ kind: "artifact", format: "CSV" }));
  await fixture.install(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);
  for (const path of reportPreviewPaths) expect(fixture.count(path)).toBe(0);
  expect(binary.posts).toBe(0);
});

test("invalid selectors never normalize or issue preview/export requests", async ({ page }) => {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  const binary = await installBinary(page, () => ({ kind: "artifact", format: "CSV", company: true }));
  await enterCompanyReports(page);
  for (const [kind, value] of [["DAILY", "0099-01-01"], ["WEEKLY", "2026-09-22"], ["MONTHLY", "0099-01"]] as const) {
    const dialog = await loadReport(page, kind, value);
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.locator("input")).toHaveValue(value);
    await dialog.getByRole("button", { name: "Close" }).click();
  }
  for (const path of reportPreviewPaths) expect(fixture.count(path)).toBe(0);
  expect(binary.posts).toBe(0);
});

test("Company to Location to Company fences a delayed first Company preview", async ({ page }) => {
  let companyReads = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === companyReportPaths.daily) {
        companyReads += 1;
        const reply = companyReportReply(path, request, companyReads === 1 ? 91 : 23)!;
        return companyReads === 1 ? { ...reply, delayMs: 800 } : reply;
      }
      return locationReportReply(path, request, 6);
    },
  });
  await fixture.install(page);
  await enterCompanyReports(page);
  let dialog = await loadReport(page, "DAILY");
  await expect.poll(() => fixture.count(companyReportPaths.daily)).toBe(1);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  dialog = await loadReport(page, "DAILY");
  await expect(dialog.getByText("6", { exact: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  dialog = await loadReport(page, "DAILY");
  await expect(dialog.getByText("23", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(900);
  await expect(dialog.getByText("91", { exact: true })).toHaveCount(0);
});

test("selector A failure cannot replace selector B success", async ({ page }) => {
  const fixture = companyReportsFixture((path, request) => {
    if (path !== companyReportPaths.daily) return undefined;
    const date = new URL(request.url()).searchParams.get("date");
    if (date === REPORT_SELECTORS.daily) return { status: 500, body: { code: "INTERNAL", message: "old", requestId: "old" }, delayMs: 700 };
    return companyReportReply(path, request, 52);
  });
  await fixture.install(page);
  await enterCompanyReports(page);
  const dialog = await loadReport(page, "DAILY");
  await expect.poll(() => fixture.count(companyReportPaths.daily)).toBe(1);
  await changeReportSelector(page, "2026-09-22");
  await expect(dialog.getByText("52", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(dialog.getByText(/old|could not be loaded/u)).toHaveCount(0);
});

test("reportExports false leaves preview usable and export unavailable", async ({ page }) => {
  const subscriptionPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  const fixture = companyReportsFixture((path) => path === subscriptionPath ? subscriptionReply(false) : undefined);
  await fixture.install(page);
  const binary = await installBinary(page, () => ({ kind: "artifact", format: "CSV", company: true }));
  await enterCompanyReports(page);
  const dialog = await loadReport(page, "DAILY");
  await expect(dialog.getByTestId("report-preview-content")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Export CSV/u })).toBeDisabled();
  await expect(dialog.getByText(/Exports are unavailable/u)).toBeVisible();
  expect(binary.posts).toBe(0);
});

for (const scope of ["COMPANY", "LOCATION"] as const) {
  test(`${scope} advisory subscription delay does not block preview`, async ({ page }) => {
    await proveAdvisoryDelayDoesNotBlockPreview(page, scope);
  });
}

test("advisory subscription failure does not block preview", async ({ page }) => {
  await proveAdvisoryFailureDoesNotBlockPreview(page);
});

test("pending export disables both formats and blocks double-submit", async ({ page }) => {
  await proveExportDoubleSubmitIsBlocked(page);
});

for (const [scopeName, fixtureFactory, enter, company] of [
  ["Location", companyLocationReportsFixture, enterCompanyLocationReports, false],
  ["Company", companyReportsFixture, enterCompanyReports, true],
] as const) {
  for (const format of ["CSV", "PDF"] as const) {
    for (const kind of ["DAILY", "WEEKLY", "MONTHLY"] as const) {
      test(`successful ${scopeName} ${kind} ${format} uses one exact POST and real bytes`, async ({ page }) => {
        await installObjectUrlRevokeProbe(page);
        const fixture = fixtureFactory();
        await fixture.install(page);
        const binary = await installBinary(page, () => ({ kind: "artifact", format, company }));
        await enter(page);
        const dialog = await loadReport(page, kind);
        const downloadPromise = page.waitForEvent("download");
        await dialog.getByRole("button", { name: new RegExp(`Export ${format}`, "u") }).click();
        const prefix = company ? "company-report" : "report";
        const proof = exportProof(kind, format);
        const filename = `${prefix}-${kind.toLowerCase()}-${proof.filenameSelector}.${format.toLowerCase()}`;
        await expectArtifact(await downloadPromise, format, filename);
        await expectObjectUrlRevoked(page);
        expect(binary.posts).toBe(1);
        expectExportRequest(
          binary,
          company ? companyReportPaths.export : locationReportPaths.export,
          proof.body,
        );
      });
    }
  }
}

test("final authority, entitlement, and size denials produce no download", async ({ page }) => {
  await proveFinalExportDenials(page);
});

test("lost response is unknown outcome with one POST and no automatic retry", async ({ page }) => {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  const binary = await installBinary(page, () => ({ kind: "abort", delayMs: 100 }));
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  await enterCompanyReports(page);
  const dialog = await loadReport(page, "DAILY");
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expect(dialog.getByText(/outcome unknown/u)).toBeVisible();
  await page.waitForTimeout(700);
  expect(binary.posts).toBe(1);
  expect(downloads).toBe(0);
});

test("401 reconciles auth without replay; explicit retry creates one new POST", async ({ page }) => {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  const binary = await installBinary(page, (count) => count === 1
    ? { kind: "json", status: 401, body: { code: "STAFF_AUTHENTICATION_FAILED", message: "expired", requestId: "401" } }
    : { kind: "artifact", format: "CSV", company: true });
  await enterCompanyReports(page);
  const dialog = await loadReport(page, "DAILY");
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expect(dialog.getByText(/Authentication was refreshed/u)).toBeVisible();
  await page.waitForTimeout(400);
  expect(binary.posts).toBe(1);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expectArtifact(await downloadPromise, "CSV", `company-report-daily-${REPORT_SELECTORS.daily}.csv`);
  expect(binary.posts).toBe(2);
});

test("stale delayed artifact after selector change never downloads", async ({ page }) => {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  const binary = await installBinary(page, () => ({ kind: "artifact", format: "CSV", company: true, delayMs: 700 }));
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  await enterCompanyReports(page);
  const dialog = await loadReport(page, "DAILY");
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expect.poll(() => binary.posts).toBe(1);
  await dialog.getByLabel("Date").fill("2026-09-22");
  await page.waitForTimeout(850);
  expect(downloads).toBe(0);
});
