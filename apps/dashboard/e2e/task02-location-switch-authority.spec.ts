import { expect, test, type Page, type Request } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { subscriptionState } from "./support/fixture-data";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04FeatureAuthority } from "./support/md04-fixtures";

const managementLocations = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
const managerLocations = `/v1/staff/dashboard/organizations/${ORG_A.organizationId}/locations`;
const managementContext = `/v1/staff/management/organizations/${ORG_A.organizationId}/context`;
const managementSubscription = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;

async function enterCompanyLocation(
  page: Page,
  fixture: DashboardApiFixture,
  path = "/help",
) {
  await fixture.install(page);
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_A.name,
  );
}

async function openMenu(page: Page) {
  await page
    .locator(".topbar")
    .getByRole("button", {
      name: "Change scope",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("listbox", { name: "Select location" }),
  ).toBeVisible();
}

test("inactive Company Location is not offered on an exact operational route", async ({
  page,
}) => {
  const inactiveB = { ...LOCATION_B, status: "INACTIVE" as const };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, inactiveB] },
  });
  await enterCompanyLocation(page, fixture, "/live-operations");
  fixture.counts.clear();
  await openMenu(page);
  await expect(page.getByRole("option", { name: LOCATION_B.name })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("option", { name: LOCATION_A.name }),
  ).toBeVisible();
  expect(fixture.count(managementLocations)).toBe(1);
  expect(fixture.count(managementContext)).toBe(0);
});

test("Location Manager menu exposes only the current granted discovery set", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.goto("/help");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  fixture.counts.clear();
  await openMenu(page);
  await expect(
    page.getByRole("option", { name: LOCATION_A.name }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: LOCATION_B.name })).toHaveCount(
    0,
  );
  await expect(page.getByRole("option", { name: "All Locations" })).toHaveCount(
    0,
  );
  expect(fixture.count(managerLocations)).toBe(1);
});

test("Location Manager grant-set scope uses the topbar menu and never offers All Locations", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
    },
    override: (path, request) =>
      path === "/v1/staff/dashboard/feature-authority"
        ? md04FeatureAuthority(request, "LM")
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    "Locations",
  );

  await openMenu(page);
  await expect(page.getByRole("option", { name: "All Locations" })).toHaveCount(
    0,
  );
  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect(page).toHaveURL(/\/overview$/u);
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_B.name,
  );
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toHaveCount(0);
});

test("candidate proof remains bounded and does not rediscover Organizations", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
  });
  await enterCompanyLocation(page, fixture);
  fixture.counts.clear();
  await openMenu(page);
  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_B.name,
  );
  await page.waitForLoadState("networkidle");

  expect(fixture.count(managementLocations)).toBe(1);
  expect(fixture.count(managementContext)).toBe(2);
  expect(fixture.count(managementSubscription)).toBe(2);
  expect(fixture.count("/v1/staff/management/organizations")).toBe(0);
  expect(fixture.count("/v1/staff/dashboard/organizations")).toBe(0);
  expect(fixture.count("/v1/staff/operational-context")).toBe(0);
});

test("entitlement loss during selection commits the valid scope only onto the authorized recovery route", async ({
  page,
}) => {
  let entitlementLost = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) => {
      if (path !== managementSubscription || !entitlementLost) return undefined;
      return {
        body: {
          organizationId: ORG_A.organizationId,
          subscription: {
            ...subscriptionState(),
            entitlements: {
              basicBranding: false,
              dashboardAccess: false,
              reportExports: false,
            },
          },
        },
      };
    },
  });
  await enterCompanyLocation(page, fixture);
  await openMenu(page);
  entitlementLost = true;
  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect(page).toHaveURL(/\/billing-subscription$/u);
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_B.name,
  );
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toHaveCount(0);
  await expect(page.getByText("Dashboard access").last()).toBeVisible();
  await expect(
    page.getByText("Disabled", { exact: true }).first(),
  ).toBeVisible();
});

test("current base-authority loss during candidate proof returns to the normal chooser recovery", async ({
  page,
}) => {
  let authorityLost = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) => {
      if (path !== managementContext || !authorityLost) return undefined;
      return {
        status: 404,
        body: {
          code: "AUTHORIZATION_DENIED",
          message: "denied",
          requestId: "task02-authority-loss",
        },
      };
    },
  });
  await enterCompanyLocation(page, fixture);
  await openMenu(page);
  authorityLost = true;
  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await expect(page.locator(".topbar .location-context")).toHaveCount(0);
});

test("candidate MFA step-up never auto-commits the old Location intent", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    mfaState: "STEP_UP_REQUIRED",
    override: (path, request, current) => {
      if (
        path === managementContext &&
        candidateLocationId(request) === LOCATION_B.locationId &&
        !current.mfaAssured
      ) {
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "step up",
            requestId: "task02-mfa",
          },
        };
      }
      return undefined;
    },
  });
  await enterCompanyLocation(page, fixture);
  await openMenu(page);
  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_A.name,
  );
  await expect(page).toHaveURL(/\/help$/u);
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
});

function candidateLocationId(request: Request): string | null {
  return new URL(request.url()).searchParams.get("locationId");
}
