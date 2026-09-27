import { expect, test, type Page } from "@playwright/test";
import { staffDirectoryItem } from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

async function enterCompanyAllLocations(
  page: Page,
  path: string,
): Promise<void> {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

test("Roles Users resets signed cursor and history before the next Organization read", async ({
  page,
}) => {
  const oldPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/staff`;
  const newPath = `/v1/staff/management/organizations/${ORG_B.organizationId}/staff`;
  const newCursors: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [],
      [ORG_B.organizationId]: [],
    },
    override: (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === oldPath && cursor === null) {
        return {
          body: {
            items: [staffDirectoryItem("alpha@example.com")],
            nextCursor: "org-a-next",
          },
        };
      }
      if (path === oldPath && cursor === "org-a-next") {
        return {
          body: {
            items: [staffDirectoryItem("old-page@example.com")],
            nextCursor: null,
          },
          delayMs: 450,
        };
      }
      if (path === newPath) {
        newCursors.push(cursor);
        return {
          body: {
            items: [
              staffDirectoryItem(
                "bravo@example.com",
                "88888888-8888-4888-8888-888888888888",
              ),
            ],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterCompanyAllLocations(page, "/roles-permissions");
  await page.getByRole("tab", { name: "Users" }).click();
  await expect(
    page.getByText("alpha@example.com", { exact: true }),
  ).toBeVisible();

  const oldSecondPage = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === oldPath &&
      new URL(request.url()).searchParams.get("cursor") === "org-a-next",
  );
  await page
    .getByTestId("md02-page")
    .getByRole("button", { name: "Next" })
    .click();
  await oldSecondPage;

  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_B.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await page.getByRole("tab", { name: "Users" }).click();

  await expect(
    page.getByText("bravo@example.com", { exact: true }),
  ).toBeVisible();
  expect(newCursors[0]).toBeNull();
  expect(newCursors.every((cursor) => cursor === null)).toBe(true);
  await expect(
    page.getByTestId("md02-page").getByRole("button", { name: "Previous" }),
  ).toBeDisabled();
  await page.waitForTimeout(550);
  await expect(
    page.getByText("old-page@example.com", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("bravo@example.com", { exact: true }),
  ).toBeVisible();
});
