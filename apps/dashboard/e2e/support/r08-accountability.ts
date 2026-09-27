import { expect, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  type FixtureReply,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import { incidentItem, keyItem, OP_IDS } from "./operations-fixtures";
import { md04AuditReply } from "./md04-audit-fixtures";
import { md04FeatureAuthority } from "./md04-fixtures";

export const r08Path = (
  family: string,
  locationId: string = LOCATION_A.locationId,
) => `/v1/staff/dashboard/locations/${locationId}/overview/${family}`;
export const keys = [
  keyItem(),
  {
    ...keyItem(),
    keySlotId: OP_IDS.vehicle,
    code: "K-13",
    holdingSessionId: OP_IDS.session,
  },
  {
    ...keyItem(),
    keySlotId: OP_IDS.task,
    code: "K-14",
    slotStatus: "INACTIVE",
  },
  {
    ...keyItem(),
    keySlotId: OP_IDS.retrieval,
    code: "K-15",
    slotStatus: "INACTIVE",
    holdingSessionId: OP_IDS.session,
  },
];
export const incidents = [
  { ...incidentItem(), severity: "LOW", status: "OPEN" },
  { ...incidentItem(), incidentId: OP_IDS.vehicle, severity: "MEDIUM" },
  {
    ...incidentItem(),
    incidentId: OP_IDS.task,
    severity: "HIGH",
    type: "KEY_MISSING",
  },
  {
    ...incidentItem(),
    incidentId: OP_IDS.retrieval,
    severity: "CRITICAL",
    type: "FUTURE_TYPE",
  },
];

export function r08Fixture(
  override?: (path: string) => FixtureReply | undefined,
) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      const custom = override?.(path);
      if (custom) return custom;
      if (path === "/v1/staff/dashboard/feature-authority")
        return md04FeatureAuthority(request, "CA");
      if (path === r08Path("keys"))
        return { body: { items: keys, nextCursor: null } };
      if (path === r08Path("incidents"))
        return { body: { items: incidents, nextCursor: null } };
      return md04AuditReply(path, request, "CA");
    },
  });
}

export async function enterR08(
  page: Page,
  route: string,
  fixture = r08Fixture(),
  allLocations = false,
) {
  await fixture.install(page);
  await page.goto(route);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", {
      name: allLocations ? "All Locations" : LOCATION_A.name,
      exact: true,
    })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return fixture;
}
