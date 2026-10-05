import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  ORG_A,
  ORG_B,
  LOCATION_A,
} from "./support/dashboard-api-fixture";
import { companyPolicy } from "./support/presence-data";
import { companySettings } from "./support/administration-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

test("Organization A→B→A retires the old Company policy error", async ({
  page,
}) => {
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  let delay = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [LOCATION_A],
      [ORG_B.organizationId]: [],
    },
    override: async (path) => {
      const organizationId = path.includes(ORG_B.organizationId)
        ? ORG_B.organizationId
        : ORG_A.organizationId;
      if (path.endsWith("/settings"))
        return { body: { ...companySettings(), organizationId } };
      if (!path.endsWith("/shift-presence/policy")) return undefined;
      if (delay && organizationId === ORG_A.organizationId) {
        delay = false;
        started();
        await pending;
        return {
          status: 403,
          body: {
            code: "PRESENCE_SCOPE_DENIED",
            message: "Retired organization",
            requestId: "fixture",
          },
        };
      }
      return { body: { ...companyPolicy(), organizationId } };
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  const input = page.locator("#presence-shiftPresenceMaxAccuracyMeters");
  await expect(input).toHaveValue("50");
  delay = true;
  await page
    .getByTestId("shift-presence")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await requested;
  for (const organization of [ORG_B, ORG_A]) {
    await page.locator(".sidebar-scope").click();
    await page
      .getByRole("button", { name: organization.name, exact: true })
      .click();
    await page
      .getByRole("button", { name: "All Locations", exact: true })
      .click();
    await expect(input).toHaveValue("50");
  }
  release();
  await expect(input).toBeEnabled();
  await expect(page.getByTestId("shift-presence")).not.toContainText(
    "no longer authorized",
  );
  expect(
    fixture.count(
      `/v1/staff/management/organizations/${ORG_A.organizationId}/shift-presence/policy/default`,
    ),
  ).toBe(0);
});
