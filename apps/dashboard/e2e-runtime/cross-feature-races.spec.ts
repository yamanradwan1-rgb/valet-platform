import type { Page } from "@playwright/test";

import { installDelayedRealResponse } from "./support/delayed-real-response";
import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  runtimeFixture as f,
  selectCompany,
  signIn,
} from "./support/runtime-fixture";

async function changeScope(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Change scope" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
}

async function openBranding(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
}

test("pending real Audit read from Organization A cannot populate Organization B", async ({ page }) => {
  await signIn(page, f.emails.multiAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page, f.organizations.a);
  await openBranding(page);
  await page.getByLabel("Display name").fill("MD06 Audit Race Brand");
  const brandWrite = page.waitForResponse((response) =>
    response.request().method() === "PUT" &&
    new URL(response.url()).pathname.endsWith("/branding/default"));
  await page.getByRole("button", { name: "Save Display name" }).click();
  expect((await brandWrite).status()).toBe(200);

  const auditA =
    `/v1/staff/management/organizations/${f.organizations.a.id}/audit-events`;
  const delayed = await installDelayedRealResponse(
    page,
    (request) => request.method() === "GET" && new URL(request.url()).pathname === auditA,
  );
  const oldAudit = delayed.arm("success");
  await page.getByRole("link", { name: "Audit Log" }).click();
  await oldAudit.started;

  await changeScope(page);
  await selectCompany(page, f.organizations.b);
  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
  oldAudit.release();
  await page.waitForTimeout(150);

  await expect(
    page.getByRole("table").getByText("MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByText(f.organizations.b.name, { exact: true }).first()).toBeVisible();
});

test("pending protected write commits old scope but cannot present success in newer scope", async ({ page }) => {
  await signIn(page, f.emails.multiAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page, f.organizations.a);
  await openBranding(page);

  const writePath =
    `/v1/staff/management/organizations/${f.organizations.a.id}/branding/default`;
  const delayed = await installDelayedRealResponse(
    page,
    (request) => request.method() === "PUT" && new URL(request.url()).pathname === writePath,
  );
  const oldWrite = delayed.arm("success");
  await page.getByLabel("Display name").fill("MD06 Old Scope Write");
  await page.getByRole("button", { name: "Save Display name" }).click();
  await oldWrite.started;

  await changeScope(page);
  await selectCompany(page, f.organizations.b);
  await expect(page.getByLabel("Display name")).toHaveValue(f.organizations.b.name);
  oldWrite.release();
  await page.waitForTimeout(150);
  await expect(page.getByLabel("Display name")).toHaveValue(f.organizations.b.name);
  await expect(page.getByTestId("md02-page").getByRole("alert")).toHaveCount(0);

  await changeScope(page);
  await selectCompany(page, { ...f.organizations.a, name: "MD06 Old Scope Write" });
  await expect(page.getByLabel("Display name")).toHaveValue("MD06 Old Scope Write");
});
