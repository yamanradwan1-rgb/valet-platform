import { installDelayedRealResponse } from "./support/delayed-real-response";
import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  runtimeFixture as f,
  selectCompany,
  signIn,
} from "./support/runtime-fixture";

test("real pending report export cannot publish after logout generation change", async ({ page }) => {
  await signIn(page, f.emails.exportAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page);
  await page.getByRole("link", { name: "Reports" }).click();
  await page.getByRole("button", { name: "Preview Daily Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Preview Daily Report" });
  await dialog.getByLabel("Date").fill("2026-09-21");
  await dialog.getByRole("button", { name: "Load preview" }).click();
  await expect(dialog.getByTestId("report-preview-content")).toBeVisible();

  const exportPath =
    `/v1/staff/management/organizations/${f.organizations.a.id}/reports/exports`;
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === exportPath) posts += 1;
  });
  const delayed = await installDelayedRealResponse(
    page,
    (request) => request.method() === "POST" && new URL(request.url()).pathname === exportPath,
  );
  const oldExport = delayed.arm("success");
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await oldExport.started;

  await page.getByRole("button", { name: "Sign out" }).evaluate((button: HTMLButtonElement) => {
    button.click();
  });
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  oldExport.release();
  await page.waitForTimeout(150);

  expect(posts).toBe(1);
  expect(downloads).toBe(0);
  await expect(page.getByTestId("report-preview-content")).toHaveCount(0);
});
