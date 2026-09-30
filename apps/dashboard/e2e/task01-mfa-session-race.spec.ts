import { expect, test } from "@playwright/test";

import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const brandingPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/branding`;
const brandingWritePath = `${brandingPath}/default`;

function branding() {
  return {
    organizationId: ORG_A.organizationId,
    updatedAt: "2026-09-21T10:00:00.000Z",
    displayName: "VAYLET",
    primaryColor: "#1E60F0",
  };
}

test("session-generation refresh invalidates an MFA intent without replay", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    mfaState: "STEP_UP_REQUIRED",
    override: (path, request) => {
      if (path === brandingPath && request.method() === "GET") {
        return { body: branding() };
      }
      if (path === brandingWritePath && request.method() === "PUT") {
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Verification required",
            requestId: "task01-session-mfa",
          },
        };
      }
      if (path === "/v1/staff/auth/mfa/step-up") {
        return {
          status: 401,
          body: {
            code: "STAFF_AUTHENTICATION_REQUIRED",
            message: "Session refresh required",
            requestId: "task01-session-refresh",
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/branding");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();

  await page.getByLabel("Display name").fill("Old session MFA intent");
  await page.getByRole("button", { name: "Save Display name" }).click();
  const dialog = page.getByRole("dialog", { name: "Verification required" });
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  const refreshesBefore = fixture.count("/v1/staff/auth/refresh");
  await dialog.getByRole("button", { name: "Verify" }).click();

  await expect
    .poll(() => fixture.count("/v1/staff/auth/refresh"))
    .toBe(refreshesBefore + 1);
  await expect(dialog).toHaveCount(0);
  expect(fixture.count(brandingWritePath)).toBe(1);
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
  await expect(page.getByText("submit the action again")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(fixture.count(brandingWritePath)).toBe(1);
});
