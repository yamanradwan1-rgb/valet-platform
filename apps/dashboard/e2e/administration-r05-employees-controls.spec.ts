import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { staffItem, staffPath } from "./support/administration-r05-fixtures";

async function signInCompany(page: Page, locationName: string | null = null) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: locationName ?? "All Locations" })
    .click();
}

test("R05 Employees controls reset on scope plus identity/session generation replacement", async ({
  page,
}) => {
  const pathA = staffPath(ORG_A.organizationId);
  const pathB = staffPath(ORG_B.organizationId);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    override: (path) => {
      if (path === pathA)
        return { body: { items: [staffItem()], nextCursor: null } };
      if (path === pathB)
        return {
          body: {
            items: [
              staffItem({
                identity: { email: "bravo@example.com" },
                membershipId: "88888888-8888-4888-8888-888888888888",
              }),
            ],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await page.getByRole("searchbox").fill("worker");
  await page
    .getByRole("combobox", { name: "Role" })
    .selectOption("VALET_EMPLOYEE");
  await page.locator(".sidebar-scope").click();
  await page.getByRole("button", { name: ORG_B.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(
    page.getByText("bravo@example.com", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue("ALL");

  await page.getByRole("searchbox").fill("bravo");
  await page.getByRole("combobox", { name: "Status" }).selectOption("ACTIVE");
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "replacement-admin@example.com");
  await page.getByRole("button", { name: ORG_B.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue(
    "ALL",
  );
});
