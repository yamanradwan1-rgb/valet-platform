import { expect, test, type Page } from "@playwright/test";

import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  STAFF_EMAIL,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";

async function signInCompany(page: Page, locationName: string | null = null) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: locationName ?? "All Locations" })
    .click();
}

test("R05 Employees preserves opaque cursors and preserves server filters", async ({
  page,
}) => {
  const path = staffPath(ORG_A.organizationId);
  const seen: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (requestPath, request) => {
      if (requestPath !== path) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      seen.push(cursor);
      if (cursor) {
        const q = new URL(request.url()).searchParams;
        expect(q.get("search")).toBe("worker");
        expect(q.get("role")).toBe("VALET_EMPLOYEE");
        expect(q.get("status")).toBe("ACTIVE");
      }
      return cursor === null
        ? {
            body: { items: [staffItem()], nextCursor: "staff_cursor_12345678" },
          }
        : {
            body: {
              items: [
                staffItem({
                  identity: { email: "second@example.com" },
                  membershipId: "77777777-7777-4777-8777-777777777777",
                  role: "ORG_ADMIN",
                }),
              ],
              nextCursor: null,
            },
          };
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("worker");
  await page
    .getByRole("combobox", { name: "Role" })
    .selectOption("VALET_EMPLOYEE");
  await page.getByRole("combobox", { name: "Status" }).selectOption("ACTIVE");

  await expect.poll(() => fixture.count(path)).toBe(4);
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("second@example.com", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("worker");
  await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue(
    "VALET_EMPLOYEE",
  );
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue(
    "ACTIVE",
  );
  expect(seen).toContain("staff_cursor_12345678");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("worker");
  await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue(
    "VALET_EMPLOYEE",
  );
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue(
    "ACTIVE",
  );
  await expect(page.getByText(/Page \d+ of \d+/u)).toHaveCount(0);
});
