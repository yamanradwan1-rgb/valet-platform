import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  enterPhysicalResources,
  openPhysicalResources,
} from "./support/keys-spots";

const at = "2026-09-29T03:00:00.000Z";
const keyPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/physical-resources/key-slots`;

function key(code: string, id: string) {
  return {
    keySlotId: id,
    code,
    status: "ACTIVE" as const,
    createdAt: at,
    updatedAt: at,
  };
}

test("logout fences a delayed physical-resource response", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === keyPath
        ? {
            delayMs: 900,
            body: {
              items: [key("LATE-A", "44444444-4444-4444-8444-444444444444")],
              nextCursor: null,
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("LATE-A", { exact: true })).toHaveCount(0);
});

test("identity replacement cannot repaint the new session from an old read", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, _request, api) => {
      if (path !== keyPath) return undefined;
      return api.count(path) === 1
        ? {
            delayMs: 900,
            body: {
              items: [
                key("OLD-IDENTITY", "66666666-6666-4666-8666-666666666666"),
              ],
              nextCursor: null,
            },
          }
        : {
            body: {
              items: [
                key("NEW-IDENTITY", "77777777-7777-4777-8777-777777777777"),
              ],
              nextCursor: null,
            },
          };
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "replacement@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await openPhysicalResources(page);
  await expect(page.getByText("NEW-IDENTITY", { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("OLD-IDENTITY", { exact: true })).toHaveCount(0);
});
