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
const inspectorPath = (locationId: string) => `${physicalBase(locationId)}/overview`;
const keyPath = (locationId: string) => `${physicalBase(locationId)}/key-slots`;
const spotPath = (locationId: string) =>
  `${physicalBase(locationId)}/parking-spots`;
const zonePath = (locationId: string) =>
  `${physicalBase(locationId)}/parking-zones`;
const labelPath = (locationId: string, resourceId: string) =>
  `${keyPath(locationId)}/${resourceId}/label`;
const companyOrganizationsPath = "/v1/staff/management/organizations";
const companyLocationsPath = `${companyOrganizationsPath}/${ORG_A.organizationId}/locations`;

test("Keys & Spots uses the accepted Resource inspector without retired outer tabs", async ({
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
  await openPhysicalResources(page);
  await expect(page.locator('[data-resource-code="K-01"]')).toBeVisible();
  const occupancyReads = fixture.count(occupancyPath);
  const inspectorReads = fixture.count(inspectorPath(LOCATION_A.locationId));
  const organizationReads = fixture.count(companyOrganizationsPath);
  const locationDiscoveryReads = fixture.count(companyLocationsPath);
  expect(occupancyReads).toBe(0);
  expect(inspectorReads).toBeGreaterThan(0);
  expect(inspectorReads).toBeLessThanOrEqual(2);
  expect(locationDiscoveryReads).toBeGreaterThan(0);
  expect(fixture.count(keyPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(spotPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(zonePath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID))).toBe(
    0,
  );

  await expect(page.getByRole("tablist", { name: "Keys & Spots" })).toHaveCount(0);
  const family = page.getByRole("group", { name: "Resource family" });
  const keys = family.getByRole("button", { name: /Key Slots/u });
  const spots = family.getByRole("button", { name: /Parking Spots/u });
  await expect(keys).toHaveAttribute("aria-pressed", "true");
  await keys.focus();
  await keys.press("Tab");
  await expect(spots).toBeFocused();
  await spots.press("Enter");
  await expect(spots).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-resource-code="P-01"]')).toBeVisible();
  expect(fixture.count(occupancyPath)).toBe(occupancyReads);
  expect(fixture.count(companyOrganizationsPath)).toBe(organizationReads);
  expect(fixture.count(companyLocationsPath)).toBe(locationDiscoveryReads);
  expect(fixture.count(inspectorPath(LOCATION_A.locationId))).toBe(inspectorReads);
  expect(fixture.count(keyPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(spotPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(zonePath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID))).toBe(
    0,
  );
  await keys.click();
  await page.getByRole("button", { name: "View QR label" }).first().click();
  const label = page.getByRole("dialog", { name: "Physical resource label" });
  await expect(label).toBeVisible();
  const labelReads = fixture.count(
    labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID),
  );
  expect(labelReads).toBeGreaterThan(0);
  expect(labelReads).toBeLessThanOrEqual(2);
  await label.press("Escape");

  await spots.click();
  await expect(page.locator('[data-resource-code="P-01"]')).toBeVisible();
  expect(fixture.count(inspectorPath(LOCATION_A.locationId))).toBe(inspectorReads);
  expect(fixture.count(spotPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(zonePath(LOCATION_A.locationId))).toBe(0);
  await page.getByRole("button", { name: "Add Parking Spot" }).click();
  const create = page.getByRole("dialog", { name: "Add Parking Spot" });
  await expect(create).toBeVisible();
  const zoneReads = fixture.count(zonePath(LOCATION_A.locationId));
  expect(zoneReads).toBeGreaterThan(0);
  expect(zoneReads).toBeLessThanOrEqual(2);
  await create.press("Escape");
  const settled = {
    key: fixture.count(inspectorPath(LOCATION_A.locationId)),
    label: fixture.count(labelPath(LOCATION_A.locationId, ISSUE232_KEY_ID)),
    occupancy: fixture.count(occupancyPath),
    organizations: fixture.count(companyOrganizationsPath),
    spot: fixture.count(spotPath(LOCATION_A.locationId)),
    zone: fixture.count(zonePath(LOCATION_A.locationId)),
  };
  await page.waitForTimeout(300);
  expect({
    key: fixture.count(inspectorPath(LOCATION_A.locationId)),
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
      name: "مستكشف الموارد",
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "المفاتيح ومواقف السيارات" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "اللغة", exact: true }).click();

  const physicalReadsBeforeLocations = fixture.count(inspectorPath(LOCATION_A.locationId));
  await nav.getByRole("link", { name: "Locations" }).click();
  await page
    .getByTestId("location-master")
    .getByRole("button", { name: new RegExp(LOCATION_A.name, "u") })
    .click();
  await expect(page.getByTestId("location-detail")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "مستكشف الموارد" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Key Slot" })).toHaveCount(
    0,
  );
  expect(
    fixture.count(inspectorPath(LOCATION_A.locationId)),
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
  const activePhysical = new Issue232PhysicalState(true);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, inactive] },
    override: (path, request) => {
      if (path === inspectorPath(inactive.locationId)) return { body: {
        counts: {
          keySlots: { configured: 1, active: 0, available: null, inUse: null, unknown: 1 },
          parkingSpots: { configured: 0, active: 0, available: null, occupied: null, unknown: 0 },
        },
        keySlots: { items: [{
          keySlotId: inactiveKey.keySlotId, code: inactiveKey.code,
          label: null, status: "INACTIVE", usage: "UNKNOWN",
          holdingSessionId: null, holdingVehicle: null,
        }], nextCursor: null },
        parkingSpots: { items: [], nextCursor: null },
      } };
      return activePhysical.reply(path, request) ?? operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await enterKeysSpots(page);
  await expect(page.locator('[data-resource-code="K-01"]')).toBeVisible();

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
  await expect(page.locator('[data-resource-code="K-HIST"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Key Slot" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "View QR label" })).toBeDisabled();
  expect(fixture.count(inactiveOccupancy)).toBe(0);
  expect(fixture.count(inspectorPath(inactive.locationId))).toBeGreaterThan(0);
  expect(fixture.count(inspectorPath(inactive.locationId))).toBeLessThanOrEqual(2);
  expect(fixture.count(keyPath(inactive.locationId))).toBe(0);
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
  await expect(page.locator('[data-resource-code="K-01"]')).toBeVisible();
  await openPhysicalResources(page);
  await expect(page.locator('[data-resource-code="K-01"]')).toBeVisible();
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
