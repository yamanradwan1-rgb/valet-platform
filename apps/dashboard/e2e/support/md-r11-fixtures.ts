import type { Page } from "@playwright/test";
import {
  companySettings,
  managementLocationSettings,
  integrationsProjection,
  staffDirectoryItem,
} from "./administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";

export const r11Base = `/v1/staff/management/organizations/${ORG_A.organizationId}`;
export const r11Branding = {
  organizationId: ORG_A.organizationId,
  updatedAt: "2026-09-21T08:00:00.000Z",
  displayName: "VAYLET",
  primaryColor: "#176BFF",
};

export function r11Fixture() {
  const state = { nullSubscription: false };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${r11Base}/settings`) return { body: companySettings() };
      if (path === `${r11Base}/locations/${LOCATION_A.locationId}/settings`)
        return { body: managementLocationSettings() };
      if (path === `${r11Base}/branding`) return { body: r11Branding };
      if (path === `${r11Base}/locations/${LOCATION_A.locationId}/branding`) {
        const inherited = (value: string) => ({
          default: value,
          overridePresent: false,
          override: null,
          effective: value,
        });
        return {
          body: {
            ...r11Branding,
            locationId: LOCATION_A.locationId,
            displayName: inherited(r11Branding.displayName),
            primaryColor: inherited(r11Branding.primaryColor),
          },
        };
      }
      if (path === `${r11Base}/integrations`)
        return { body: integrationsProjection() };
      if (path === `${r11Base}/staff`)
        return { body: { items: [staffDirectoryItem()], nextCursor: null } };
      if (path === `${r11Base}/subscription` && state.nullSubscription)
        return {
          body: { organizationId: ORG_A.organizationId, subscription: null },
        };
      return undefined;
    },
  });
  return { fixture, state };
}

export async function enterR11(page: Page, path = "/policies") {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}
