import { expect, test } from "@playwright/test";
import { companyDailyReportResponseSchema } from "@valet/contracts";
import {
  companyReportsFixture,
  enterCompanyReports,
  loadReport,
} from "./support/md05-reports-e2e-helpers";
import {
  companyReportPaths,
  companyReportReply,
  locationReportPaths,
} from "./support/md05-reports-fixtures";
import { financialCurrency } from "./support/md05-intelligence-fixtures";
import { enterR10Contacts } from "./support/md-r10-fixtures";
import { customerHistoryPath, visitSearchPath } from "./support/md04-fixtures";
import { reportsCopy } from "../src/features/intelligence/reports-copy";

test("manager preview preserves null, zero, exact money and separate currency evidence with one request", async ({
  page,
}) => {
  const fixture = companyReportsFixture((path, request) => {
    if (path !== companyReportPaths.daily) return undefined;
    const body = companyDailyReportResponseSchema.parse(
      companyReportReply(path, request)!.body,
    );
    body.summary.operational.metrics.checkInTime.averageSeconds = "640.000";
    body.summary.operational.metrics.parkingTime.averageSeconds = "0.000";
    body.summary.operational.metrics.handoffTime.averageSeconds = null;
    body.summary.operational.metrics.handoffTime.sampleCount = 0;
    body.summary.operational.metrics.handoffTime.contributingLocationCount = 0;
    body.summary.financial.currencies = [
      financialCurrency("JOD", "12.345"),
      financialCurrency("USD", "45.670"),
    ];
    return { body };
  });
  await fixture.install(page);
  await enterCompanyReports(page);
  expect(fixture.count(companyReportPaths.daily)).toBe(0);
  const dialog = await loadReport(page, "DAILY");
  const row = (key: string) =>
    dialog
      .locator("dl > div")
      .filter({ has: page.locator("dt small bdi", { hasText: key }) });
  await expect(row("checkInTime.averageSeconds")).toContainText("10m 40s");
  await expect(row("checkInTime.averageSeconds")).toContainText("640.000");
  await expect(row("parkingTime.averageSeconds")).toContainText("0 seconds");
  await expect(row("handoffTime.averageSeconds")).toContainText("Unavailable");
  await expect(row("JOD.collectedAmountTotal")).toContainText("12.345");
  await expect(row("USD.collectedAmountTotal")).toContainText("45.670");
  expect(fixture.count(companyReportPaths.daily)).toBe(1);
  for (const path of Object.values(locationReportPaths))
    expect(fixture.count(path)).toBe(0);
});

for (const malformed of ["content-type", "filename"] as const) {
  test(`export rejects malformed ${malformed} without download or replay`, async ({
    page,
  }) => {
    await companyReportsFixture().install(page);
    let posts = 0;
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.route(`**${companyReportPaths.export}`, async (route) => {
      posts++;
      await route.fulfill({
        status: 200,
        body: "section,key,subkey,currency,value\r\n",
        headers: {
          "content-type":
            malformed === "content-type"
              ? "text/html"
              : "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${malformed === "filename" ? "../wrong.csv" : "company-report-daily-2026-09-21.csv"}"`,
        },
      });
    });
    await enterCompanyReports(page);
    const dialog = await loadReport(page, "DAILY");
    await dialog.getByRole("button", { name: /Export CSV/ }).click();
    await expect(
      dialog.getByText(reportsCopy("en").exportMalformed),
    ).toBeVisible();
    expect(posts).toBe(1);
    expect(downloads).toBe(0);
  });
}

test("contact search loads only one bounded page and history only after explicit selection", async ({
  page,
}) => {
  const searches: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === visitSearchPath) searches.push(url);
  });
  const fixture = await enterR10Contacts(page);
  expect(fixture.count(visitSearchPath)).toBe(1);
  expect(fixture.count(customerHistoryPath)).toBe(0);
  expect(searches[0]!.searchParams.get("limit")).toBe("25");
  await page
    .getByRole("button", {
      name: "Details for result 1: Alex One",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog").getByText("COMPLETED", { exact: true }),
  ).toBeVisible();
  expect(fixture.count(customerHistoryPath)).toBe(1);
  expect(fixture.count(visitSearchPath)).toBe(1);
});

for (const locale of ["en", "ar"] as const) {
  test(`narrow dark correction preserves readable fields and keyboard focus in ${locale}`, async ({
    page,
  }, info) => {
    await enterR10Contacts(page);
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    if (locale === "ar")
      await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.setViewportSize({ width: 480, height: 900 });
    await page.locator("tbody button").first().click();
    const correctionLabel = locale === "en" ? "Correct name" : "تصحيح الاسم";
    await page
      .getByRole("button", { name: correctionLabel, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole("textbox")).toBeFocused();
    expect((await dialog.boundingBox())!.width).toBe(448);
    await expect(dialog).toHaveCSS("background-color", "rgb(13, 21, 47)");
    await page.screenshot({ path: info.outputPath("correction.png") });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: correctionLabel, exact: true }),
    ).toBeFocused();
  });
}
