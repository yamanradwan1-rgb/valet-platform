import { expect, type Page } from "@playwright/test";
import { PresenceFixture } from "./presence-fixtures";
import { LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";

export async function open407Studio(
  page: Page,
  fixture = new PresenceFixture("LM"),
) {
  await fixture.fixture.install(page);
  await page.goto("/policies?section=zones");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  if (fixture.authority === "CA") {
    await page
      .getByRole("button", { name: "Location overrides", exact: true })
      .click();
    await page.locator('.ps-section-links a[href*="section=zones"]').click();
  }
  await expect(page.locator(".ps-zone-map")).toBeVisible();
  return fixture;
}

export async function draft407Zone(page: Page) {
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("NEW_GATE");
  await page.getByLabel("Zone label", { exact: true }).fill("New gate");
}
