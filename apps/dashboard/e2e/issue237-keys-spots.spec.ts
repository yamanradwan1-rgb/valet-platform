import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  ISSUE232_KEY_ID,
  Issue232PhysicalState,
} from "./support/issue232-physical-resources";
import { enterKeysSpots, openPhysicalResources } from "./support/keys-spots";
import { operationsReadReply } from "./support/operations-fixtures";
import { lifecyclePath, locationLifecycle } from "./support/r06-locations";

const occupancyPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/keys`;
const physicalBase = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/physical-resources`;
const keyPath = (locationId: string) => `${physicalBase(locationId)}/key-slots`;
const spotPath = (locationId: string) =>
  `${physicalBase(locationId)}/parking-spots`;
const zonePath = (locationId: string) =>
  `${physicalBase(locationId)}/parking-zones`;
const labelPath = (locationId: string, resourceId: string) =>
  `${keyPath(locationId)}/${resourceId}/label`;
const companyOrganizationsPath = "/v1/staff/management/organizations";
const companyLocationsPath = `${companyOrganizationsPath}/${ORG_A.organizationId}/locations`;

test("Keys & Spots composes frozen views lazily and removes resources from Locations", async ({
  page,
}) => {
  const physical = new Issue232PhysicalState(true);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === lifecyclePath)
        return {
          body: locationLifecycle({ status: "ACTIVE", acceptingIntake: true }),
        };
      return physical.reply(path, request) ?? operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await enterKeysSpots(page);

  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await expect(nav.getByRole("link", { name: "Keys & Spots" })).toBeVisible();
  await expect(page).toHaveURL(/\/keys$/u);
  await expect(page.getByText("K-12", { exact: true })).toBeVisible();
  const occupancyReads = fixture.count(occupancyPath);
  const organizationReads = fixture.count(companyOrganizationsPath);
  const locationDiscoveryReads = fixture.count(companyLocationsPath);
  expect(occupancyReads).toBeGreaterThan(0);
  expect(occupancyReads).toBeLessThanOrEqual(2);
  expect(locationDiscoveryReads).toBeGreaterThan(0);
  expect(fixture.count(keyPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(spotPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(zonePath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID))).toBe(
    0,
  );

  const outerTabs = page.getByRole("tablist", { name: "Keys & Spots" });
  const operational = outerTabs.getByRole("tab", { name: "Operational Keys" });
  const configuration = outerTabs.getByRole("tab", {
    name: "Physical Resources",
  });
  await operational.focus();
  await operational.press("ArrowRight");
  await expect(configuration).toBeFocused();
  await expect(configuration).toHaveAttribute("aria-selected", "false");
  await configuration.press("Enter");
  await expect(configuration).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Physical Resources" }),
  ).toBeVisible();
  await expect(page.getByText("K-01", { exact: true })).toBeVisible();
  expect(fixture.count(occupancyPath)).toBe(occupancyReads);
  expect(fixture.count(companyOrganizationsPath)).toBe(organizationReads);
  expect(fixture.count(companyLocationsPath)).toBe(locationDiscoveryReads);
  const keyReads = fixture.count(keyPath(LOCATION_A.locationId));
  expect(keyReads).toBeGreaterThan(0);
  expect(keyReads).toBeLessThanOrEqual(2);
  expect(fixture.count(spotPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(zonePath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID))).toBe(
    0,
  );
  await page.getByRole("button", { name: "View label" }).first().click();
  const label = page.getByRole("dialog", { name: "Physical resource label" });
  await expect(label).toBeVisible();
  const labelReads = fixture.count(
    labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID),
  );
  expect(labelReads).toBeGreaterThan(0);
  expect(labelReads).toBeLessThanOrEqual(2);
  await label.press("Escape");

  const innerTabs = page.getByRole("tablist", { name: "Physical Resources" });
  const keySlotsTab = innerTabs.getByRole("tab", { name: "Key Slots" });
  const parkingSpotsTab = innerTabs.getByRole("tab", { name: "Parking Spots" });
  await keySlotsTab.focus();
  await keySlotsTab.press("ArrowRight");
  await expect(parkingSpotsTab).toBeFocused();
  await expect(parkingSpotsTab).toHaveAttribute("aria-selected", "false");
  await parkingSpotsTab.press("Enter");
  await expect(page.getByText("P-01", { exact: true })).toBeVisible();
  expect(fixture.count(keyPath(LOCATION_A.locationId))).toBe(keyReads);
  const spotReads = fixture.count(spotPath(LOCATION_A.locationId));
  expect(spotReads).toBeGreaterThan(0);
  expect(spotReads).toBeLessThanOrEqual(2);
  expect(fixture.count(zonePath(LOCATION_A.locationId))).toBe(0);
  await page.getByRole("button", { name: "Add Parking Spot" }).click();
  const create = page.getByRole("dialog", { name: "Add Parking Spot" });
  await expect(create).toBeVisible();
  const zoneReads = fixture.count(zonePath(LOCATION_A.locationId));
  expect(zoneReads).toBeGreaterThan(0);
  expect(zoneReads).toBeLessThanOrEqual(2);
  await create.press("Escape");
  const settled = {
    key: fixture.count(keyPath(LOCATION_A.locationId)),
    label: fixture.count(labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID)),
    occupancy: fixture.count(occupancyPath),
    organizations: fixture.count(companyOrganizationsPath),
    spot: fixture.count(spotPath(LOCATION_A.locationId)),
    zone: fixture.count(zonePath(LOCATION_A.locationId)),
  };
  await page.waitForTimeout(300);
  expect({
    key: fixture.count(keyPath(LOCATION_A.locationId)),
    label: fixture.count(labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID)),
    occupancy: fixture.count(occupancyPath),
    organizations: fixture.count(companyOrganizationsPath),
    spot: fixture.count(spotPath(LOCATION_A.locationId)),
    zone: fixture.count(zonePath(LOCATION_A.locationId)),
  }).toEqual(settled);
  expect(fixture.count(companyLocationsPath)).toBe(locationDiscoveryReads);

  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "المفاتيح ومواقف السيارات",
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "المفاتيح ومواقف السيارات" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "اللغة", exact: true }).click();

  const physicalReadsBeforeLocations =
    fixture.count(keyPath(LOCATION_A.locationId)) +
    fixture.count(spotPath(LOCATION_A.locationId));
  await nav.getByRole("link", { name: "Locations" }).click();
  await page
    .getByTestId("location-master")
    .getByRole("button", { name: new RegExp(LOCATION_A.name, "u") })
    .click();
  await expect(page.getByTestId("location-detail")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Physical Resources" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Key Slot" })).toHaveCount(
    0,
  );
  expect(
    fixture.count(keyPath(LOCATION_A.locationId)) +
      fixture.count(spotPath(LOCATION_A.locationId)),
  ).toBe(physicalReadsBeforeLocations);
});

test("inactive Company Admin reaches read-only configuration with zero occupancy", async ({
  page,
}) => {
  const inactive = {
    ...LOCATION_B,
    status: "INACTIVE" as const,
    name: "Historic Garage",
  };
  const inactiveKey = {
    keySlotId: "88888888-8888-4888-8888-888888888888",
    code: "K-HIST",
    status: "INACTIVE",
    createdAt: "2026-09-29T03:00:00.000Z",
    updatedAt: "2026-09-29T03:00:00.000Z",
  };
  const inactiveOccupancy = `/v1/staff/dashboard/locations/${inactive.locationId}/overview/keys`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, inactive] },
    override: (path) => {
      if (path === occupancyPath) return operationsReadReply(path);
      if (path === keyPath(inactive.locationId))
        return { body: { items: [inactiveKey], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterKeysSpots(page);
  await expect(page.getByText("K-12", { exact: true })).toBeVisible();

  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: new RegExp(inactive.name, "u") }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "All Locations", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: new RegExp(inactive.name, "u") })
    .click();
  await expect(page).toHaveURL(/\/keys$/u);
  await expect(
    page
      .locator(".topbar")
      .getByRole("button", { name: "Change scope", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("Select an active exact Location to view this information."),
  ).toBeVisible();
  const inactiveNavigation = page
    .getByRole("navigation", { name: "Management navigation" })
    .first();
  await expect(
    inactiveNavigation.getByRole("link", { name: "Keys & Spots" }),
  ).toBeVisible();
  for (const activeOnly of [
    "Live Operations",
    "Vehicles",
    "Tasks",
    "Maps & Zones",
    "Incidents",
  ]) {
    await expect(
      inactiveNavigation.getByRole("link", { name: activeOnly }),
    ).toHaveCount(0);
  }
  expect(fixture.count(inactiveOccupancy)).toBe(0);
  expect(fixture.count(keyPath(inactive.locationId))).toBe(0);

  await openPhysicalResources(page);
  await expect(page.getByText("K-HIST", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Key Slot" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "View label" })).toBeDisabled();
  expect(fixture.count(inactiveOccupancy)).toBe(0);
  expect(fixture.count(keyPath(inactive.locationId))).toBeGreaterThan(0);
  expect(fixture.count(keyPath(inactive.locationId))).toBeLessThanOrEqual(2);
  expect(fixture.count(spotPath(inactive.locationId))).toBe(0);
});

test("Location Manager keeps exact active grant and cannot choose inactive or All Locations", async ({
  page,
}) => {
  const inactive = { ...LOCATION_B, status: "INACTIVE" as const };
  const physical = new Issue232PhysicalState(true);
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, inactive],
    },
    override: (path, request) =>
      physical.reply(path, request) ?? operationsReadReply(path),
  });
  await fixture.install(page);
  await enterKeysSpots(page, "manager@example.com");
  await expect(page.getByText("K-12", { exact: true })).toBeVisible();
  await openPhysicalResources(page);
  await expect(page.getByText("K-01", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Key Slot" }),
  ).toBeVisible();

  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "All Locations", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: inactive.name, exact: true }),
  ).toHaveCount(0);
});
