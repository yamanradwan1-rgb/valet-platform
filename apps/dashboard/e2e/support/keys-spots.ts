import { expect, type Page } from "@playwright/test";

import { LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";

export async function enterKeysSpots(
  page: Page,
  email?: string,
  locationName = LOCATION_A.name,
) {
  await page.goto("/keys");
  await signInOnCurrentPage(page, email);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Keys & Spots", level: 1 }),
  ).toBeVisible();
}

export async function openPhysicalResources(page: Page) {
  await page
    .getByRole("tablist", { name: "Keys & Spots" })
    .getByRole("tab", { name: "Physical Resources" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Physical Resources" }),
  ).toBeVisible();
}

export async function enterPhysicalResources(
  page: Page,
  email?: string,
  locationName = LOCATION_A.name,
) {
  await enterKeysSpots(page, email, locationName);
  await openPhysicalResources(page);
}

export async function selectCompanyLocationAfterReload(
  page: Page,
  locationName = LOCATION_A.name,
) {
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName, exact: true }).click();
  await openPhysicalResources(page);
}

export async function switchTopbarLocation(page: Page, locationName: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .click();
  await page.getByRole("option", { name: locationName, exact: true }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    locationName,
  );
}
