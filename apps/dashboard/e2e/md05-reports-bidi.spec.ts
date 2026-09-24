import { expect, test } from "@playwright/test";

import {
  companyReportsFixture,
  enterCompanyReports,
  expectArtifact,
  installBinary,
} from "./support/md05-reports-e2e-helpers";
import { REPORT_SELECTORS } from "./support/md05-reports-fixtures";

test("Arabic report preview isolates canonical labels without changing localized labels", async ({ page }) => {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  const binary = await installBinary(page, () => ({
    kind: "artifact",
    format: "CSV",
    company: true,
  }));
  await enterCompanyReports(page);
  await page.setViewportSize({ width: 480, height: 900 });
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const opener = page.getByRole("button", { name: "معاينة التقرير اليومي" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "معاينة التقرير اليومي" });
  const close = dialog.getByRole("button", { name: "إغلاق" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  const input = dialog.getByLabel("التاريخ");
  await expect(input).toBeFocused();
  await input.fill(REPORT_SELECTORS.daily);
  await dialog.getByRole("button", { name: "تحميل المعاينة" }).click();

  const labels = dialog.locator("dt bdi[dir='ltr']");
  for (const label of [
    REPORT_SELECTORS.daily,
    "JOD.paidPaymentCount",
    "Asia/Amman.locationCount",
    "keyExceptions.KEY_MISSING",
    "severity.LOW",
    "type.TEST",
    "dispatch.RETRIEVAL.QUEUED",
    "keyCustody.RELEASED",
  ]) {
    await expect(labels.filter({ hasText: label })).toBeVisible();
  }
  await expect(dialog.getByText("معرّف المؤسسة", { exact: true }).locator("bdi")).toHaveCount(0);
  await expect(dialog.getByText(/ليست ملفات PDF عربية/u)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  const csv = dialog.getByRole("button", { name: /تصدير CSV/u });
  await csv.focus();
  await page.keyboard.press("Enter");
  await expectArtifact(
    await downloadPromise,
    "CSV",
    `company-report-daily-${REPORT_SELECTORS.daily}.csv`,
  );
  expect(binary.posts).toBe(1);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.locator("tbody tr")).toHaveCount(3);
});
