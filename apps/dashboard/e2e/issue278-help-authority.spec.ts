import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, LOCATION_B, ORG_A, ORG_B, supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  areaItem, liveMapBody, operationsReadReply, pointItem,
} from "./support/operations-fixtures";
import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";
import { enterKeysSpots, openPhysicalResources } from "./support/keys-spots";
import { Issue232PhysicalState } from "./support/issue232-physical-resources";

const help = (page: Page, key: ContextHelpKey) =>
  page.getByRole("button", { name: "Help: " + contextHelpRegistry[key].en.title, exact: true });
const livePath = "/v1/staff/locations/" + LOCATION_A.locationId + "/live-operations-map";
const mapBase = "/v1/staff/locations/" + LOCATION_A.locationId + "/map/";
const lmSubscription = "/v1/staff/dashboard/locations/" + LOCATION_A.locationId + "/subscription";

test("LM without Dashboard entitlement sees Maps Setup Help, never Live Help or live reads", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === lmSubscription) return {
        body: { organizationId: ORG_A.organizationId, locationId: LOCATION_A.locationId,
          subscription: { planCode: "E2E", status: "ACTIVE",
            entitlements: { dashboardAccess: false, reportExports: false, basicBranding: false } } },
      };
      if (path === mapBase + "points") return { body: { points: [pointItem()] } };
      if (path === mapBase + "areas") return { body: { areas: [areaItem()] } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(help(page, "maps.page")).toBeVisible();
  await expect(help(page, "maps.mode")).toBeVisible();
  await expect(help(page, "maps.setup")).toBeVisible();
  await expect(help(page, "maps.live")).toHaveCount(0);
  await expect(help(page, "maps.legend")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  const before = [...fixture.counts.entries()].sort();
  await help(page, "maps.setup").click();
  await expect(page.getByRole("dialog", { name: contextHelpRegistry["maps.setup"].en.title }))
    .toContainText(contextHelpRegistry["maps.setup"].en.body);
  expect([...fixture.counts.entries()].sort()).toEqual(before);
  expect(fixture.count(livePath)).toBe(0);
});

test("Supervisor Maps Live help respects setup and physical-resource authority boundary", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path) => path === livePath ? { body: liveMapBody() } : undefined,
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page.getByRole("button", { name: ORG_A.name + " · " + LOCATION_A.name }).click();
  for (const key of ["maps.page", "maps.mode", "maps.live", "maps.legend"] as const) {
    await expect(help(page, key)).toBeVisible();
  }
  await expect(help(page, "maps.setup")).toHaveCount(0);
  await expect(help(page, "keys.configuration")).toHaveCount(0);
  expect(fixture.count(mapBase + "points")).toBe(0);
  expect(fixture.count(mapBase + "areas")).toBe(0);
});

test("inactive Company Admin Keys keeps configuration Help, not operating Help or create Help", async ({ page }) => {
  const inactive = { ...LOCATION_B, name: "Historic Garage", status: "INACTIVE" as const };
  const physical = new Issue232PhysicalState(true);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, inactive] },
    override: (path, request) => physical.reply(path, request) ?? operationsReadReply(path),
  });
  await fixture.install(page);
  await enterKeysSpots(page);
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("option", { name: /Historic Garage/u }).click();
  await expect(help(page, "keys.page")).toBeVisible();
  await expect(help(page, "keys.operational")).toHaveCount(0);
  await openPhysicalResources(page);
  await expect(help(page, "keys.configuration")).toBeVisible();
  await expect(help(page, "keys.resourceDetails")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Key Slot" })).toHaveCount(0);
});

test("wrong-Organization server context never reveals Location-owned contextual Help", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === "/v1/staff/management/organizations/" + ORG_A.organizationId + "/context"
      ? { body: { organization: ORG_B,
        scope: { kind: "LOCATION", locationId: LOCATION_A.locationId },
        selectedLocation: LOCATION_A, capabilities: ["LOCATION_DASHBOARD_READ"] } }
      : operationsReadReply(path),
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(help(page, "vehicles.page")).toHaveCount(0);
  await expect(help(page, "vehicles.table")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("revoked LM Location grant invalidates open Help before another workspace is selected", async ({ page }) => {
  let revoked = false;
  const discovery = "/v1/staff/dashboard/organizations/" + ORG_A.organizationId + "/locations";
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (revoked && path === discovery) {
        return { body: { items: [], nextCursor: null } };
      }
      return operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await help(page, "vehicles.page").click();
  await expect(page.getByRole("dialog", { name: contextHelpRegistry["vehicles.page"].en.title })).toBeVisible();
  revoked = true;
  await page.locator(".sidebar-scope").evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByRole("button", { name: LOCATION_A.name })).toHaveCount(0);
  await expect(help(page, "vehicles.page")).toHaveCount(0);
  await expect(help(page, "vehicles.table")).toHaveCount(0);
  expect(fixture.count(discovery)).toBeGreaterThan(1);
});
