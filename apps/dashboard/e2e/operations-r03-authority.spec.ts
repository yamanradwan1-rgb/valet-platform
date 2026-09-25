import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { operationsReadReply } from "./support/operations-fixtures";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const sessionsPath = `${overview}/sessions`;
const countsPath = `${overview}/session-state-counts`;
const locationSubscription =
  `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/subscription`;
const organizationSubscription =
  `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;

function businessReads(fixture: DashboardApiFixture): number {
  return fixture.count(sessionsPath) + fixture.count(countsPath);
}

test("R03 CA exact active Location is allowed while All Locations sends no operational reads", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => operationsReadReply(path),
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("Select an active exact Location to view this information.")).toBeVisible();
  expect(businessReads(fixture)).toBe(0);

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Live Operations", level: 1 })).toBeVisible();
  await expect.poll(() => businessReads(fixture)).toBeGreaterThan(0);
});

test("R03 LM can read only the granted exact active Location when dashboard entitlement is true", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => operationsReadReply(path),
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Live Operations", level: 1 })).toBeVisible();
  await expect.poll(() => fixture.count(sessionsPath)).toBeGreaterThan(0);
  await expect.poll(() => fixture.count(countsPath)).toBeGreaterThan(0);
});

test("R03 LM dashboardAccess=false is denied before operational reads", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === locationSubscription) {
        return {
          body: {
            organizationId: ORG_A.organizationId,
            locationId: LOCATION_A.locationId,
            subscription: {
              planCode: "E2E",
              status: "ACTIVE",
              entitlements: {
                dashboardAccess: false,
                reportExports: false,
                basicBranding: false,
              },
            },
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Live Operations", level: 1 })).toHaveCount(0);
  expect(businessReads(fixture)).toBe(0);
});

test("R03 Company Admin without dashboard entitlement receives no Live Operations data", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === organizationSubscription) {
        return {
          body: {
            organizationId: ORG_A.organizationId,
            subscription: {
              planCode: "E2E",
              status: "ACTIVE",
              entitlements: {
                dashboardAccess: false,
                reportExports: false,
                basicBranding: false,
              },
            },
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByText(/dashboard access is unavailable/i)).toBeVisible();
  expect(businessReads(fixture)).toBe(0);
});

test("R03 inactive Location can be selected historically but never reads operations", async ({ page }) => {
  const inactive = { ...LOCATION_A, status: "INACTIVE" as const };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [inactive] },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: /Main Garage/u }).click();
  await expect(page.getByText("Select an active exact Location to view this information.")).toBeVisible();
  expect(businessReads(fixture)).toBe(0);
});

test("R03 Supervisor and Employee direct routes expose no Live Operations business data", async ({ page }) => {
  const supervisor = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
  });
  await supervisor.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await expect(page.getByRole("heading", { name: "Live Operations", level: 1 })).toHaveCount(0);
  expect(businessReads(supervisor)).toBe(0);
  await expect(page.getByRole("link", { name: "Live Operations" })).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  const employee = new DashboardApiFixture({
    operationalContexts: [employeeContext()],
  });
  await employee.install(page);
  await page.goto("/live-operations");
  if (await page.getByRole("heading", { name: "Sign in" }).isVisible()) {
    await signInOnCurrentPage(page, "employee@example.com");
  }
  await expect(page.getByRole("heading", { name: "Live Operations", level: 1 })).toHaveCount(0);
  expect(businessReads(employee)).toBe(0);
});

test("R03 unauthenticated direct navigation stays on Staff sign-in with zero business reads", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  expect(businessReads(fixture)).toBe(0);
});
