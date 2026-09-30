import { expect, test, type Page } from "@playwright/test";

import { DashboardApiFixture } from "./support/dashboard-api-fixture";

const stepUpPath = "/v1/staff/auth/mfa/step-up";
const recoveryPath = "/v1/staff/auth/mfa/recovery/begin";
const recoveryInput = `vmr1-${"a".repeat(11)}-${"b".repeat(27)}`;

async function signInSecurity(page: Page) {
  await page.goto("/security");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("Security keeps code fields literal, associates verification errors, and focuses the workspace", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    mfaState: "STEP_UP_REQUIRED",
    override: (path) => {
      if (path !== stepUpPath && path !== recoveryPath) return undefined;
      return {
        status: 403,
        body: {
          code: "MFA_VERIFICATION_FAILED",
          message: "MFA verification failed.",
          requestId:
            path === stepUpPath
              ? "issue234-invalid-totp"
              : "issue234-invalid-recovery",
        },
      };
    },
  });
  await fixture.install(page);
  await signInSecurity(page);

  await expect(
    page.getByRole("heading", { name: "Security", level: 1 }),
  ).toBeFocused();
  const totp = page.getByLabel("6-digit authenticator code");
  const recovery = page.getByLabel("Recovery code");
  await expect(totp).toHaveAttribute("dir", "ltr");
  await expect(recovery).toHaveAttribute("dir", "ltr");

  await totp.focus();
  await totp.fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  const alert = page.locator("#account-security-ceremony-error");
  await expect(alert).toContainText("The verification code was not accepted.");
  await expect(totp).toBeFocused();
  await expect(totp).toHaveAttribute("aria-invalid", "true");
  await expect(totp).toHaveAttribute("aria-describedby", "account-security-ceremony-error");

  await recovery.focus();
  await recovery.fill(recoveryInput);
  await page.getByRole("button", { name: "Use recovery code" }).click();
  await expect(recovery).toBeFocused();
  await expect(recovery).toHaveAttribute("aria-invalid", "true");
  await expect(recovery).toHaveAttribute(
    "aria-describedby",
    "account-security-ceremony-error",
  );

  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByLabel("رمز تطبيق المصادقة المكوّن من 6 أرقام")).toHaveAttribute(
    "dir",
    "ltr",
  );
  await expect(page.getByLabel("رمز الاسترداد")).toHaveAttribute("dir", "ltr");
});

test("Security setup and recovery disclosures follow the approved focus sequence", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({ mfaState: "ENROLLMENT_REQUIRED" });
  await fixture.install(page);
  await signInSecurity(page);

  const securityHeading = page.getByRole("heading", {
    name: "Security",
    level: 1,
  });
  await expect(securityHeading).toBeFocused();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const setupHeading = page.getByRole("heading", {
    name: "Authenticator setup",
    level: 2,
  });
  await expect(setupHeading).toBeFocused();
  await page.keyboard.press("Tab");
  const totp = page.getByLabel("6-digit authenticator code");
  await expect(totp).toBeFocused();
  await expect(totp).toHaveAttribute("dir", "ltr");

  await totp.fill("123456");
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  const disclosureHeading = page.getByRole("heading", {
    name: "Recovery codes",
    level: 2,
  });
  await expect(disclosureHeading).toBeFocused();
  await page.getByRole("button", { name: "I saved these codes" }).click();

  const reissue = page.getByRole("button", {
    name: "Replace recovery codes",
    exact: true,
  });
  await expect(reissue).toBeFocused();
  await reissue.click();
  const reissueTotp = page.getByLabel("6-digit authenticator code");
  await expect(reissueTotp).toHaveAttribute("dir", "ltr");
  await reissueTotp.fill("234567");
  await page
    .getByRole("button", { name: "Replace recovery codes", exact: true })
    .click();
  await expect(disclosureHeading).toBeFocused();
  await page.getByRole("button", { name: "I saved these codes" }).click();
  await expect(reissue).toBeFocused();
});
