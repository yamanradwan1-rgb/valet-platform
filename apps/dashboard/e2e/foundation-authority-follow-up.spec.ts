import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signIn } from "./support/foundation-ui";

test("selected-scope MFA step-up blocks content until fresh route revalidation succeeds", async ({
  page,
}) => {
  const subscriptionPath =
    `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  let requireStepUp = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    mfaState: "STEP_UP_REQUIRED",
    override: (path, _request, state) => {
      if (path !== subscriptionPath || !requireStepUp || state.mfaAssured) {
        return undefined;
      }
      return {
        status: 403,
        body: {
          code: "MFA_STEP_UP_REQUIRED",
          message: "MFA_STEP_UP_REQUIRED",
          requestId: "e2e-selected-scope-step-up",
        },
      };
    },
  });
  await fixture.install(page);
  await signIn(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(
    page.getByRole("heading", { name: "Authorized workspace" }),
  ).toBeVisible();

  requireStepUp = true;
  await page.getByRole("link", { name: "Employees & Shifts" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "MFA status:" }),
  ).toContainText("Verification required");
  await expect(
    page.getByRole("heading", { name: "Employees & Shifts" }),
  ).toHaveCount(0);
  const deniedReadCount = fixture.count(subscriptionPath);

  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(
    page.getByRole("heading", { name: "Employees & Shifts" }),
  ).toBeVisible();
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
  expect(fixture.count(subscriptionPath)).toBeGreaterThan(deniedReadCount);
});

test("ManagementFoundationApp composes complete navigation from NavigationAuthority", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
  });
  await fixture.install(page);
  await signIn(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();

  const navigation = page.getByRole("navigation", {
    name: "Management navigation",
  });
  await navigation
    .getByRole("link", { name: "Billing & Subscription" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Billing & Subscription" }),
  ).toBeVisible();

  await expect(navigation.getByRole("link", { name: "Workspace" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Security" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Help" })).toBeVisible();
});