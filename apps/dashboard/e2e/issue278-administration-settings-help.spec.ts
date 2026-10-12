import { expect, test, type Page } from "@playwright/test";

import {
  companySettings,
  managementLocationSettings,
} from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  legacyLocationKeys,
  settingDefinitions,
} from "../src/features/administration/settings/setting-definitions";

const companyPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/settings`;
const locationPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations/${LOCATION_A.locationId}/settings`;
const managerPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/configuration`;
const ordinary = settingDefinitions.map(({ key }) => key);
const manager = ordinary.filter((key) => legacyLocationKeys.has(key));

async function assertHelpRows(page: Page, keys: readonly string[]) {
  for (const key of keys) {
    const exact = page.locator(`tr[data-setting="${key}"]`);
    await expect(exact).toHaveCount(1);
    await expect(exact.getByRole("button", { name: /^(Help:|مساعدة:)/u })).toHaveCount(1);
    const help = exact.getByRole("button", { name: /^(Help:|مساعدة:)/u });
    await expect(help).toHaveAttribute("type", "button");
    expect(
      await help.evaluate((node) => node.previousElementSibling?.textContent?.trim()),
    ).toBe("Save");
  }
}

test("CA Company defaults mount all 15 real ordinary rows and Operating Hours Help", async ({ page }) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) writes.push(path);
      return path === companyPath && request.method() === "GET"
        ? { body: companySettings() }
        : undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await assertHelpRows(page, ordinary);
  await expect(page.locator('tr[data-setting="operatingHours"]').getByRole("button", { name: /^Help:/u }))
    .toHaveCount(1);
  await expect(page.getByRole("button", { name: "Help: Company defaults tab" })).toBeVisible();
  const pending = page.locator('tr[data-setting="trackingEnabled"]');
  await pending.locator("select").selectOption("false");
  await pending.getByRole("button", { name: /^Help:/u }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(pending.locator("select")).toHaveValue("false");
  expect(writes).toEqual([]);
});

test("CA Location overrides mount 15 rows plus Operating Hours and SLA without mutations", async ({ page }) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) writes.push(path);
      if (path === companyPath && request.method() === "GET") return { body: companySettings() };
      if (path === locationPath && request.method() === "GET") return { body: managementLocationSettings() };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("tab", { name: "Location overrides" }).click();
  await assertHelpRows(page, ordinary);
  await expect(page.locator('tr[data-setting="operatingHours"]')
    .getByRole("button", { name: /^Help:/u })).toHaveCount(1);
  const sla = page.locator('tr[data-setting="slaTargetSeconds"]');
  await expect(sla.getByRole("button", { name: /^Help:/u })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Help: Location overrides tab" })).toBeVisible();
  await sla.getByRole("button", { name: /^Help:/u }).click();
  await page.keyboard.press("Escape");
  expect(writes).toEqual([]);
});

test("LM mounts exactly ten legacy rows with accessible Help, no extra policy exposure", async ({ page }) => {
  const defaults = companySettings().defaults;
  const lm = {
    organizationId: ORG_A.organizationId,
    locationId: LOCATION_A.locationId,
    timezone: LOCATION_A.timezone,
    currency: LOCATION_A.currency,
    updatedAt: "2026-09-21T08:00:00.000Z",
    settings: manager.map((key) => {
      const value = defaults[key as keyof typeof defaults];
      return { setting: key, default: value, overridePresent: false, override: null, effective: value };
    }),
  };
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) writes.push(path);
      return path === managerPath && request.method() === "GET" ? { body: lm } : undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await assertHelpRows(page, manager);
  await expect(page.locator('tr[data-setting]')).toHaveCount(10);
  await expect(page.locator('tr[data-setting="languageDefault"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help: Location overrides tab" })).toBeVisible();
  const row = page.locator('tr[data-setting="tipsEnabled"]');
  await row.getByRole("button", { name: /^Help:/u }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  expect(writes).toEqual([]);
});
