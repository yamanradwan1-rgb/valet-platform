import { expect, type Page } from "@playwright/test";
import type { ManagementLocationLifecycleResponse } from "@valet/contracts";

import { LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";

export const locationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
export const lifecyclePath = `${locationsPath}/${LOCATION_A.locationId}/lifecycle`;

export function locationLifecycle(
  changes: Partial<ManagementLocationLifecycleResponse> = {},
): ManagementLocationLifecycleResponse {
  return {
    ...LOCATION_A,
    organizationId: ORG_A.organizationId,
    addressText: "R06 protected address sentinel",
    status: "INACTIVE",
    acceptingIntake: false,
    updatedAt: "2026-09-26T09:00:00.000Z",
    readiness: {
      readyForActivation: true,
      checks: { currencySupported: true, timezoneValid: true },
    },
    drain: {
      blocked: false,
      activeShiftPresent: false,
      nonCompletedValetSessionPresent: false,
      nonTerminalTaskPresent: false,
    },
    ...changes,
  };
}

export async function enterLocations(page: Page, exact = false) {
  await page.goto("/locations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: exact ? LOCATION_A.name : "All Locations" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Locations", level: 1 }),
  ).toBeVisible();
}

export async function selectLocation(page: Page, name = LOCATION_A.name) {
  await page
    .getByTestId("md02-page")
    .getByRole("button", { name: new RegExp(name) })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

export async function fillCreate(page: Page) {
  await page.getByRole("button", { name: "Add Location", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create Location" });
  for (const [label, value] of Object.entries({
    Name: "New R06 Location",
    Code: "R06",
    Address: "R06 create sentinel",
    Timezone: "Asia/Amman",
    Currency: "JOD",
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value);
  return dialog;
}
