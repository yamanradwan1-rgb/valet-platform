import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { enterR11, r11Base } from "./support/md-r11-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

test("R11 integration statuses stay distinct, bounded and read-only", async ({
  page,
}) => {
  const statuses = [
    "DISABLED",
    "UNAVAILABLE",
    "MISCONFIGURED",
    "DEGRADED",
    "OPERATIONAL",
    "UNKNOWN",
  ] as const;
  const labels = [
    "Disabled",
    "Unavailable",
    "Misconfigured",
    "Degraded",
    "Operational",
    "Unknown",
  ];
  let index = 0;
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (!path.startsWith("/v1/staff/auth/") && request.method() !== "GET")
        writes.push(path);
      if (path !== `${r11Base}/integrations`) return undefined;
      return {
        body: {
          organizationId: ORG_A.organizationId,
          integrations: [
            { key: "PLATE_OCR", status: statuses[index] },
            { key: "STAFF_PUSH", status: "UNKNOWN" },
            { key: "DIGITAL_PAYMENT", status: "DISABLED" },
          ],
        },
      };
    },
  });
  await fixture.install(page);
  await enterR11(page, "/integrations");
  const card = page
    .getByText("PLATE_OCR", { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"integrationCard")]');
  for (index = 0; index < statuses.length; index += 1) {
    if (index > 0) {
      const before = fixture.count(`${r11Base}/integrations`);
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(card).toContainText(labels[index]!);
      expect(fixture.count(`${r11Base}/integrations`)).toBe(before + 1);
    } else await expect(card).toContainText(labels[index]!);
  }
  await expect(page.locator('[class*="integrationCard"]')).toHaveCount(3);
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
    await expect(page.getByTestId("md02-page").getByRole("button")).toHaveCount(
      0,
    );
  });
}
