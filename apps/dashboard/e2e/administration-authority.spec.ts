import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

function subscription(dashboardAccess: boolean, basicBranding: boolean, locationId?: string) {
  return {
    organizationId: ORG_A.organizationId,
    ...(locationId ? { locationId } : {}),
    subscription: {
      planCode: "MD02",
      status: "ACTIVE",
      entitlements: { dashboardAccess, reportExports: true, basicBranding },
    },
  };
}

async function openCompanyRoute(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
}

test("Company Admin navigation exposes the seven MD-02 destinations with full access", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await openCompanyRoute(page, "/roles-permissions");
  await page.getByRole("button", { name: "All Locations" }).click();

  await expect(page.getByRole("heading", { name: "Roles & Permissions" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  for (const name of [
    "Employees & Shifts", "Locations", "Policies & Settings", "Roles & Permissions",
    "Branding", "Integrations", "Billing & Subscription",
  ]) {
    await expect(navigation.getByRole("link", { name })).toBeVisible();
  }
});

test("Location Manager navigation contains only the accepted Location-level MD-02 destinations", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.goto("/locations");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  for (const name of ["Employees & Shifts", "Locations", "Policies & Settings", "Branding", "Billing & Subscription"]) {
    await expect(navigation.getByRole("link", { name })).toBeVisible();
  }
  await expect(navigation.getByRole("link", { name: "Roles & Permissions" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Integrations" })).toHaveCount(0);
});

test("Company Admin Billing mounts through subscription recovery without dashboardAccess", async ({ page }) => {
  const subscriptionPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  const contextPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/context`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path) => path === subscriptionPath ? { body: subscription(false, true) } : undefined,
  });
  await fixture.install(page);
  await openCompanyRoute(page, "/billing-subscription");

  await expect(page.getByRole("heading", { name: "Billing & Subscription" })).toBeVisible();
  await expect(page.getByText("MD02", { exact: true })).toBeVisible();
  expect(fixture.count(contextPath)).toBe(0);
  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  await expect(navigation.getByRole("link", { name: "Billing & Subscription" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Locations" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Branding" })).toHaveCount(0);
});

test("ordinary Company administration stays denied when dashboardAccess is false", async ({ page }) => {
  const subscriptionPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path) => path === subscriptionPath ? { body: subscription(false, true) } : undefined,
  });
  await fixture.install(page);
  await openCompanyRoute(page, "/locations");

  await expect(page.getByTestId("md02-page")).toHaveCount(0);
  await expect(page.getByText("Management Dashboard access is unavailable for this authorized scope.")).toBeVisible();
});

for (const [dashboardAccess, basicBranding] of [[false, true], [true, false]] as const) {
  test(`Branding is denied when D=${dashboardAccess} and Brand=${basicBranding}`, async ({ page }) => {
    const subscriptionPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: (path) => path === subscriptionPath ? { body: subscription(dashboardAccess, basicBranding) } : undefined,
    });
    await fixture.install(page);
    await openCompanyRoute(page, "/branding");
    await expect(page.getByRole("heading", { name: "Branding" })).toHaveCount(0);
  });
}

test("Location Manager Billing uses the exact granted Location without dashboardAccess", async ({ page }) => {
  const subscriptionPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/subscription`;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === subscriptionPath
      ? { body: subscription(false, true, LOCATION_A.locationId) }
      : undefined,
  });
  await fixture.install(page);
  await page.goto("/billing-subscription");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Billing & Subscription" })).toBeVisible();
  await expect(page.getByText("MD02", { exact: true })).toBeVisible();
});

for (const [email, context] of [
  ["supervisor@example.com", supervisorContext()],
  ["employee@example.com", employeeContext()],
] as const) {
  test(`${email} cannot enter an MD-02 business route directly`, async ({ page }) => {
    const fixture = new DashboardApiFixture({ operationalContexts: [context] });
    await fixture.install(page);
    await page.goto("/billing-subscription");
    await signInOnCurrentPage(page, email);
    await expect(page.getByRole("heading", { name: "Billing & Subscription" })).toHaveCount(0);
  });
}
