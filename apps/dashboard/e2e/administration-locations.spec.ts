import { expect, test } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const lifecyclePath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations/${LOCATION_A.locationId}/lifecycle`;

function lifecycle() {
  return {
    organizationId: ORG_A.organizationId,
    locationId: LOCATION_A.locationId,
    name: LOCATION_A.name,
    code: LOCATION_A.code,
    addressText: "1 Main Street",
    timezone: LOCATION_A.timezone,
    currency: LOCATION_A.currency,
    status: "INACTIVE",
    acceptingIntake: false,
    updatedAt: "2026-09-21T09:00:00.000Z",
    readiness: { readyForActivation: true, checks: { currencySupported: true, timezoneValid: true } },
    drain: {
      blocked: false,
      activeShiftPresent: false,
      nonCompletedValetSessionPresent: false,
      nonTerminalTaskPresent: false,
    },
  };
}

test("Company Admin lifecycle read steps up MFA and then rereads safely", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "STEP_UP_REQUIRED",
    override: (path, request, state) => {
      if (path !== lifecyclePath || request.method() !== "GET") return undefined;
      if (!state.mfaAssured) {
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Verification required",
            requestId: "lifecycle-mfa",
          },
        };
      }
      return { body: lifecycle() };
    },
  });
  await fixture.install(page);
  await page.goto("/locations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  await expect(page.getByRole("heading", { name: "Verification required" })).toBeVisible();
  await page.getByLabel(/authenticator code/i).fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(page.getByRole("heading", { name: LOCATION_A.name })).toBeVisible();
  await expect(page.getByText(/Supported currency: Enabled/u)).toBeVisible();
  await expect(page.getByText(/Valid timezone: Enabled/u)).toBeVisible();
  expect(fixture.count(lifecyclePath)).toBeGreaterThanOrEqual(2);
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
  await expect(page.getByRole("button", { name: "Edit Location" })).toHaveCount(0);
});
