import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  areaItem,
  liveMapBody,
  operationsReadReply,
  pointItem,
} from "./support/operations-fixtures";

const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;
const lmSubscription = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/subscription`;

test("CA exact Location gets read-only MD-03 navigation while All Locations cannot read operations", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => operationsReadReply(path),
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Live Operations", level: 1 })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Management navigation" });
  for (const name of ["Live Operations", "Vehicles", "Tasks", "Maps & Zones", "Keys", "Incidents"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
  for (const forbidden of ["New Check-In", "Request Vehicle", "Add Vehicle", "New Task", "Add Key", "Report Incident"]) {
    await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
  }

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("Select an active exact Location to view this information.")).toBeVisible();
});

test("LM D=false keeps Maps/setup available, hides other MD-03 reads, and sends no live-map request", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === lmSubscription) {
        return {
          body: {
            organizationId: ORG_A.organizationId,
            locationId: LOCATION_A.locationId,
            subscription: {
              planCode: "E2E",
              status: "ACTIVE",
              entitlements: { dashboardAccess: false, reportExports: false, basicBranding: false },
            },
          },
        };
      }
      if (path === pointsPath) return { body: { points: [pointItem()] } };
      if (path === areasPath) return { body: { areas: [areaItem()] } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  await expect(page.getByRole("heading", { name: "Maps & Zones", level: 1 })).toBeVisible();
  await expect(page.getByTestId("lm-live-map-unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Point" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await expect(nav.getByRole("link", { name: "Maps & Zones" })).toBeVisible();
  for (const name of ["Live Operations", "Vehicles", "Tasks", "Keys", "Incidents"]) {
    await expect(nav.getByRole("link", { name })).toHaveCount(0);
  }
  expect(fixture.count(livePath)).toBe(0);
});

test("Supervisor LOCATION_MAPS calls the real live endpoint but never gets setup controls", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path) => path === livePath ? { body: liveMapBody() } : undefined,
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }).click();

  await expect(page.getByRole("heading", { name: "Maps & Zones", level: 1 })).toBeVisible();
  const livePanel = page.getByRole("complementary", { name: "Live Operations" });
  await expect(livePanel.getByText("Live", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Observed at: Time unavailable", { exact: true })).toBeVisible();
  await expect(livePanel.getByText("Position time: Time unavailable", { exact: true }).first()).toBeVisible();
  expect(fixture.count(livePath)).toBeGreaterThanOrEqual(1);
  expect(fixture.count(livePath)).toBeLessThanOrEqual(2);
  expect(fixture.count(pointsPath)).toBe(0);
  expect(fixture.count(areasPath)).toBe(0);
  await expect(page.getByRole("button", { name: "Add Point" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Tasks" })).toHaveCount(0);
});

test("Supervisor server D denial is truthful and Employee cannot enter MD-03", async ({ page }) => {
  const denied = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path) => path === livePath
      ? { status: 403, body: { code: "DASHBOARD_ACCESS_REQUIRED", message: "denied", requestId: "e2e-403" } }
      : undefined,
  });
  await denied.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }).click();
  await expect(page.getByText("The server did not authorize the live-map read for this scope.")).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  const employee = new DashboardApiFixture({ operationalContexts: [employeeContext()] });
  await employee.install(page);
  await page.goto("/maps-zones");
  if (await page.getByRole("heading", { name: "Sign in" }).isVisible()) {
    await signInOnCurrentPage(page, "employee@example.com");
  }
  await expect(page.getByRole("heading", { name: "Maps & Zones", level: 1 })).toHaveCount(0);
});
