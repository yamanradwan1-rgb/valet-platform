import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  ORG_A,
  RECOVERY_CODE,
} from "./support/dashboard-api-fixture";
import { signIn } from "./support/foundation-ui";

test("Company Admin MFA-required entry exposes step-up and resumes discovery", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    managementRequiresMfa: true,
    mfaState: "STEP_UP_REQUIRED",
  });
  await fixture.install(page);
  await signIn(page);

  await expect(
    page.getByRole("status").filter({ hasText: "MFA status:" }),
  ).toContainText("Verification required");
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("button", { name: ORG_A.name })).toBeVisible();
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
});

test("enrollment shows server setup material and one-time recovery codes", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({ mfaState: "ENROLLMENT_REQUIRED" });
  await fixture.install(page);
  await page.goto("/security");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "MFA status:" }),
  ).toContainText("Setup required");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(
    page.getByRole("heading", { name: "Authenticator setup" }),
  ).toBeVisible();
  await expect(page.getByText("A".repeat(32))).toBeVisible();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  await expect(
    page.getByRole("heading", { name: "Recovery codes" }),
  ).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(10);
});

test("step-up recovery begins a replacement authenticator ceremony", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({ mfaState: "STEP_UP_REQUIRED" });
  await fixture.install(page);
  await page.goto("/security");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByLabel("Recovery code").fill(RECOVERY_CODE);
  await page.getByRole("button", { name: "Use recovery code" }).click();
  await expect(
    page.getByRole("heading", { name: "Authenticator setup" }),
  ).toBeVisible();
  expect(fixture.count("/v1/staff/auth/mfa/recovery/begin")).toBe(1);
});
