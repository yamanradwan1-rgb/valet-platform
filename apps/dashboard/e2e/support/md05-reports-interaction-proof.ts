import { expect, type Page } from "@playwright/test";

import { LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import {
  companyReportPaths,
  locationReportPaths,
  subscriptionReply,
} from "./md05-reports-fixtures";
import {
  companyLocationReportsFixture,
  companyReportsFixture,
  enterCompanyLocationReports,
  enterCompanyReports,
  installBinary,
  loadReport,
} from "./md05-reports-e2e-helpers";

type ReportScope = "COMPANY" | "LOCATION";

export async function proveAdvisoryDelayDoesNotBlockPreview(
  page: Page,
  scope: ReportScope,
) {
  const location = scope === "LOCATION";
  const subscriptionPath =
    `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  const advisoryReadNumber = 4;
  let subscriptionReads = 0;
  const override = (path: string) => {
    if (path !== subscriptionPath) return undefined;
    subscriptionReads += 1;
    if (subscriptionReads !== advisoryReadNumber) return undefined;
    return { ...subscriptionReply(true), delayMs: 4_000 };
  };
  const fixture = location
    ? companyLocationReportsFixture(override)
    : companyReportsFixture(override);
  await fixture.install(page);
  if (location) await enterCompanyLocationReports(page);
  else await enterCompanyReports(page);
  await expect.poll(() => subscriptionReads).toBeGreaterThanOrEqual(advisoryReadNumber);

  for (const name of [
    "Preview Daily Report",
    "Preview Weekly Report",
    "Preview Monthly Report",
  ]) {
    await expect(page.getByRole("button", { name })).toBeEnabled();
  }

  const dialog = await loadReport(page, "DAILY");
  await expect(dialog.getByTestId("report-preview-content")).toBeVisible();
  const csv = dialog.getByRole("button", { name: /Export CSV/u });
  const pdf = dialog.getByRole("button", { name: /Export PDF/u });
  await expect(csv).toBeDisabled();
  await expect(pdf).toBeDisabled();
  await expect(dialog.getByText(/Exports are unavailable/u)).toHaveCount(0);
  expect(fixture.count(location ? locationReportPaths.daily : companyReportPaths.daily)).toBe(1);
  await expect(csv).toBeEnabled();
  await expect(pdf).toBeEnabled();
}

export async function proveAdvisoryFailureDoesNotBlockPreview(page: Page) {
  const subscriptionPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  let subscriptionReads = 0;
  const fixture = companyReportsFixture((path) => {
    if (path !== subscriptionPath) return undefined;
    subscriptionReads += 1;
    if (subscriptionReads !== 4) return undefined;
    return {
      status: 503,
      body: { code: "SERVICE_UNAVAILABLE", message: "advisory unavailable", requestId: "advisory" },
    };
  });
  await fixture.install(page);
  await enterCompanyReports(page);
  await expect.poll(() => subscriptionReads).toBeGreaterThanOrEqual(4);
  const dialog = await loadReport(page, "DAILY");
  await expect(dialog.getByTestId("report-preview-content")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Export CSV/u })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /Export PDF/u })).toBeDisabled();
  await expect(dialog.getByText(/Exports are unavailable/u)).toBeVisible();
  expect(fixture.count(companyReportPaths.daily)).toBe(1);
}

export async function proveExportDoubleSubmitIsBlocked(page: Page) {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  const binary = await installBinary(page, (count) => ({
    kind: "artifact",
    format: count === 1 ? "CSV" : "PDF",
    company: true,
    ...(count === 1 ? { delayMs: 1_800 } : {}),
  }));
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  await enterCompanyReports(page);
  const dialog = await loadReport(page, "DAILY");
  const csv = dialog.getByRole("button", { name: /Export CSV/u });
  const pdf = dialog.getByRole("button", { name: /Export PDF/u });
  await expect(csv).toBeEnabled();
  await csv.focus();
  await csv.click();
  await expect.poll(() => binary.posts).toBe(1);
  await expect(csv).toBeDisabled();
  await expect(pdf).toBeDisabled();

  await page.keyboard.press("Enter");
  const pdfBox = await pdf.boundingBox();
  expect(pdfBox).not.toBeNull();
  await page.mouse.click(pdfBox!.x + pdfBox!.width / 2, pdfBox!.y + pdfBox!.height / 2);
  await page.waitForTimeout(300);
  expect(binary.posts).toBe(1);

  await expect(csv).toBeEnabled();
  await expect(pdf).toBeEnabled();
  await expect.poll(() => downloads).toBe(1);
  await pdf.click();
  await expect.poll(() => binary.posts).toBe(2);
  await expect.poll(() => downloads).toBe(2);
  expect(binary.bodies).toEqual([
    { kind: "DAILY", format: "CSV", date: "2026-09-21" },
    { kind: "DAILY", format: "PDF", date: "2026-09-21" },
  ]);
}
