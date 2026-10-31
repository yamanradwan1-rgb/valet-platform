import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { enterR11, r11Base } from "./support/md-r11-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

test("R11 legacy integration entry redirects to Studio without status read or writes", async ({
  page,
}) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (!path.startsWith("/v1/staff/auth/") && request.method() !== "GET")
        writes.push(path);
      return undefined;
    },
  });
  await fixture.install(page);
  await enterR11(page, "/integrations");
  await expect(page).toHaveURL(/\/policies$/u);
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vehicle operations" })).toBeVisible();
  await expect(page.locator('[class*="integrationCard"]')).toHaveCount(0);
  expect(fixture.count(`${r11Base}/integrations`)).toBe(0);
  await expect(
    page.getByRole("button", {
      name: /Configure|Test Connection|Connect|Enable/,
    }),
  ).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(writes).toEqual([]);
});

for (const [status, label] of [
  ["TRIAL", "Trial"],
  ["ACTIVE", "Active"],
  ["SUSPENDED", "Suspended"],
] as const) {
  test(`R11 opaque plan and ${status} subscription retain exact entitlements`, async ({
    page,
  }) => {
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) =>
        path === `${r11Base}/subscription`
          ? {
              body: {
                organizationId: ORG_A.organizationId,
                subscription: {
                  planCode: "OPAQUE_R11",
                  status,
                  entitlements: {
                    dashboardAccess: true,
                    reportExports: false,
                    basicBranding: true,
                  },
                },
              },
            }
          : undefined,
    });
    await fixture.install(page);
    await page.goto("/billing-subscription");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await expect(page.getByText("OPAQUE_R11", { exact: true })).toBeVisible();
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Report exports" }),
    ).toContainText("Disabled");
    await expect(
      page.getByRole("row").filter({ hasText: "Basic branding" }),
    ).toContainText("Enabled");
    const content = page.getByTestId("md02-page");
    // Billing stays read-only: #278-D adds only three informational Help buttons.
    await expect(content.getByRole("button", { name: /^Help:/u })).toHaveCount(3);
    await expect(content.getByRole("button")).toHaveCount(3);
  });
}
