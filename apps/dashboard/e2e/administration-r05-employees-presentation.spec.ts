import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  STAFF_EMAIL,
  STAFF_EMAIL_2,
  STAFF_MEMBERSHIP_2,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";

async function enterCompany(page: Page, exactLocation = false) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", {
      name: exactLocation ? LOCATION_A.name : "All Locations",
    })
    .click();
}

test("R05 Employees presents only truthful directory facts and server controls", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detail = `${directory}/${E2E_IDS.membership}`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === directory) {
        const query = new URL(request.url()).searchParams;
        return {
          body: {
            items: [
              staffItem(),
              staffItem({
                identity: { email: STAFF_EMAIL_2 },
                locationAccessCount: 1,
                membershipId: STAFF_MEMBERSHIP_2,
                role: "LOCATION_MANAGER",
                status: "INACTIVE",
                version: 4,
              }),
            ].filter(
              (item) =>
                (!query.get("search") ||
                  item.identity.email.includes(query.get("search")!)) &&
                (!query.get("role") || item.role === query.get("role")) &&
                (!query.get("status") || item.status === query.get("status")),
            ),
            nextCursor: null,
          },
        };
      }
      if (path === detail) return { body: staffDetail() };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterCompany(page);

  await expect(
    page.getByText("Manage staff authority and view active shifts."),
  ).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await expect(
    table.getByText("Valet Employee", { exact: true }),
  ).toBeVisible();
  await expect(
    table.getByText("Location Manager", { exact: true }),
  ).toBeVisible();
  await expect(table.getByText("Active", { exact: true })).toBeVisible();
  await expect(table.getByText("Inactive", { exact: true })).toBeVisible();
  await expect(
    table.getByText(E2E_IDS.membership, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Search and filters apply to the loaded page only."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Add Employee|Attendance/u }),
  ).toHaveCount(0);
  await expect(table.locator("img")).toHaveCount(0);

  const readsBefore = fixture.count(directory);
  await page.getByRole("searchbox").fill("manager.r05");
  await expect(table.getByText(STAFF_EMAIL_2, { exact: true })).toBeVisible();
  await expect(table.getByText(STAFF_EMAIL, { exact: true })).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Role" })
    .selectOption("LOCATION_MANAGER");
  await page.getByRole("combobox", { name: "Status" }).selectOption("INACTIVE");
  await expect.poll(() => fixture.count(directory)).toBe(readsBefore + 3);

  await page.getByRole("searchbox").fill("");
  await page.getByRole("combobox", { name: "Role" }).selectOption("ALL");
  await page.getByRole("combobox", { name: "Status" }).selectOption("ALL");
  const opener = page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` });
  await opener.click();
  const drawer = page.getByRole("dialog", { name: "Details" });
  await expect(drawer.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await expect(
    drawer.getByText(E2E_IDS.membership, { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
});
