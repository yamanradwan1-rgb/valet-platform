import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const brandingPath =
  `/v1/staff/management/organizations/${ORG_A.organizationId}/branding`;
const brandingWritePath = `${brandingPath}/default`;
const integrationsPath =
  `/v1/staff/management/organizations/${ORG_A.organizationId}/integrations`;
const subscriptionPath =
  `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;

function branding(
  displayName = "VAYLET",
  updatedAt = "2026-09-21T10:00:00.000Z",
) {
  return {
    organizationId: ORG_A.organizationId,
    updatedAt,
    displayName,
    primaryColor: "#1E60F0",
  };
}

async function openCompanyAllLocations(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

test("Company Branding requires explicit retry after sensitive MFA step-up", async ({
  page,
}) => {
  let currentBranding = branding();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "STEP_UP_REQUIRED",
    override: (path, request, state) => {
      if (path === brandingPath) return { body: currentBranding };
      if (path !== brandingWritePath) return undefined;
      if (state.count(path) === 1) {
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Verification required",
            requestId: "md02-branding-mfa",
          },
        };
      }
      const body = request.postDataJSON() as { value: string };
      currentBranding = branding(body.value, "2026-09-21T10:01:00.000Z");
      return { body: currentBranding };
    },
  });
  await fixture.install(page);
  await openCompanyAllLocations(page, "/branding");

  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
  await page.getByLabel("Display name").fill("VAYLET Jordan");
  await page.getByRole("button", { name: "Save Display name" }).click();

  await expect(
    page.getByRole("heading", { name: "Verification required" }),
  ).toBeVisible();
  expect(fixture.count(brandingWritePath)).toBe(1);
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(page.getByText(
    "Verification succeeded. Review the values and submit the action again.",
    { exact: true },
  )).toBeVisible();
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
  expect(fixture.count(brandingWritePath)).toBe(1);

  await page.getByRole("button", { name: "Save Display name" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("VAYLET Jordan");
  expect(fixture.count(brandingWritePath)).toBe(2);
});

test("sensitive Branding freshness requests TOTP even while ordinary MFA is ASSURED", async ({
  page,
}) => {
  let currentBranding = branding();
  let freshSensitiveAssurance = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "ASSURED",
    override: (path, request) => {
      if (path === brandingPath) return { body: currentBranding };
      if (path === "/v1/staff/auth/mfa/step-up") {
        freshSensitiveAssurance = true;
        return { body: { state: "ASSURED" } };
      }
      if (path !== brandingWritePath) return undefined;
      if (!freshSensitiveAssurance) {
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Verification required",
            requestId: "issue234-branding-freshness",
          },
        };
      }
      const body = request.postDataJSON() as { value: string };
      currentBranding = branding(body.value, "2026-09-21T10:03:00.000Z");
      return { body: currentBranding };
    },
  });
  await fixture.install(page);
  await openCompanyAllLocations(page, "/branding");

  await page.getByLabel("Display name").fill("Fresh Brand");
  await page.getByRole("button", { name: "Save Display name" }).click();
  const challenge = page.getByRole("dialog", { name: "Verification required" });
  await expect(challenge.getByLabel("6-digit authenticator code")).toBeVisible();
  await expect(challenge.getByRole("button", { name: "Retry" })).toHaveCount(0);
  expect(fixture.count(brandingWritePath)).toBe(1);

  await challenge.getByLabel("6-digit authenticator code").fill("123456");
  await challenge.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/Review the values and submit the action again/u)).toBeVisible();
  expect(fixture.count(brandingWritePath)).toBe(1);
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);

  await page.getByRole("button", { name: "Save Display name" }).click();
  expect(fixture.count(brandingWritePath)).toBe(2);
  await expect(page.getByLabel("Display name")).toHaveValue("Fresh Brand");
});

test("Company Branding CAS conflict reloads authoritative server state", async ({
  page,
}) => {
  let conflicted = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === brandingPath) {
        return {
          body: conflicted
            ? branding("Server Brand", "2026-09-21T10:02:00.000Z")
            : branding("VAYLET", "2026-09-21T10:00:00.000Z"),
        };
      }
      if (path === brandingWritePath) {
        conflicted = true;
        return {
          status: 409,
          body: {
            code: "VERSION_CONFLICT",
            message: "Branding changed elsewhere",
            requestId: "md02-branding-cas",
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openCompanyAllLocations(page, "/branding");

  const readsBeforeConflict = fixture.count(brandingPath);
  await page.getByLabel("Display name").fill("Client Brand");
  await page.getByRole("button", { name: "Save Display name" }).click();

  await expect(page.getByLabel("Display name")).toHaveValue("Server Brand");
  expect(fixture.count(brandingWritePath)).toBe(1);
  expect(fixture.count(brandingPath)).toBeGreaterThan(readsBeforeConflict);
  await expect(page.getByLabel("Display name")).not.toHaveValue("Client Brand");
});

test("Integrations renders the fixed truthful read-only projection", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === integrationsPath
      ? {
          body: {
            organizationId: ORG_A.organizationId,
            integrations: [
              { key: "PLATE_OCR", status: "UNKNOWN" },
              { key: "STAFF_PUSH", status: "DISABLED" },
              { key: "DIGITAL_PAYMENT", status: "OPERATIONAL" },
            ],
          },
        }
      : undefined,
  });
  await fixture.install(page);
  await openCompanyAllLocations(page, "/integrations");

  const md02 = page.getByTestId("md02-page");
  await expect(md02.getByRole("button", { name: "Plate OCR" })).toBeVisible();
  await expect(md02.getByRole("button", { name: "Staff Push" })).toBeVisible();
  await expect(md02.getByRole("button", { name: "Digital Payment" })).toBeVisible();
  await expect(md02.getByText("Unknown", { exact: true })).toBeVisible();
  await expect(md02.getByText("Disabled", { exact: true })).toBeVisible();
  await expect(md02.getByText("Operational", { exact: true })).toBeVisible();

  const unknownBadge = md02.getByText("Unknown", { exact: true });
  expect(
    await unknownBadge.evaluate((element) =>
      element.className.trim().split(/\s+/u).filter(Boolean).length),
  ).toBe(1);
  await expect(
    md02.getByRole("button", { name: /configure|test connection|webhook|secret/i }),
  ).toHaveCount(0);
  await expect(
    md02.getByRole("link", { name: /configure|test connection|webhook|secret/i }),
  ).toHaveCount(0);
  await expect(md02.getByText(/api key|webhook|secret/i)).toHaveCount(0);
});

test("Billing renders a null subscription truthfully with no mutation controls", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path) => path === subscriptionPath
      ? { body: { organizationId: ORG_A.organizationId, subscription: null } }
      : undefined,
  });
  await fixture.install(page);
  await page.goto("/billing-subscription");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();

  const md02 = page.getByTestId("md02-page");
  await expect(
    page.getByRole("heading", { name: "Billing & Subscription" }),
  ).toBeVisible();
  await expect(md02.getByText("No subscription is currently persisted.")).toBeVisible();
  const billingMutation = /upgrade|renew|cancel|checkout|invoice|payment method|card|coupon|portal|manage billing/i;
  await expect(md02.getByRole("button", { name: billingMutation })).toHaveCount(0);
  await expect(md02.getByRole("link", { name: billingMutation })).toHaveCount(0);
});
