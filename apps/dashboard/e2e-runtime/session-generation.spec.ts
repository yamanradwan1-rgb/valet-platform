import { installDelayedRealResponse } from "./support/delayed-real-response";
import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  controlFixture,
  runtimeFixture as f,
  selectCompany,
  signIn,
} from "./support/runtime-fixture";

test("revoked session generation fences an old protected result and new session MFA", async ({
  browser,
  page,
}) => {
  await signIn(page, f.emails.authorityAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page);
  await controlFixture("branding-name", "MD06 Old Session Brand");

  const brandingPath =
    `/v1/staff/management/organizations/${f.organizations.a.id}/branding`;
  const delayed = await installDelayedRealResponse(
    page,
    (request) => request.method() === "GET" && new URL(request.url()).pathname === brandingPath,
  );
  const oldRead = delayed.arm("success");
  await page.getByRole("link", { name: "Branding" }).click();
  await oldRead.started;

  await controlFixture("revoke-sessions", "authorityAdmin");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText(/Sign-out could not be confirmed/u)).toBeVisible();

  oldRead.release();
  await page.waitForTimeout(150);
  await expect(page.getByRole("navigation", { name: "Management navigation" })).toHaveCount(0);
  await expect(page.getByText("MD06 Old Session Brand", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Branding" })).toHaveCount(0);

  const replacement = await browser.newContext();
  const replacementPage = await replacement.newPage();
  await signIn(replacementPage, f.emails.authorityAdmin);
  await expect(replacementPage.getByRole("status").filter({ hasText: "MFA status:" }))
    .toContainText("Verification required");
  await replacement.close();
});
