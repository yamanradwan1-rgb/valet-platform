import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  STAFF_EMAIL,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";

async function openDetail(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  return page.getByRole("dialog", { name: "Details" });
}

test("T05-B CA status preserves last-admin and handover denials before explicit success", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const statusPath = `${detailPath}/deactivate`;
  const posts: unknown[] = [];
  let inactive = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === directory)
        return {
          body: {
            items: [
              staffItem(inactive ? { status: "INACTIVE", version: 2 } : {}),
            ],
            nextCursor: null,
          },
        };
      if (path === detailPath)
        return {
          body: staffDetail(inactive ? { status: "INACTIVE", version: 2 } : {}),
        };
      if (path === statusPath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        if (posts.length === 1)
          return {
            status: 409,
            body: {
              code: "LAST_USABLE_ADMIN_REQUIRED",
              message: "Another usable Company Admin is required.",
              requestId: "last-admin",
            },
          };
        if (posts.length === 2)
          return {
            status: 409,
            body: {
              code: "STAFF_HANDOVER_REQUIRED",
              message: "Operational handover is required before this change.",
              requestId: "handover",
            },
          };
        inactive = true;
        return { body: staffDetail({ status: "INACTIVE", version: 2 }) };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture);
  const deactivate = drawer.getByRole("button", {
    name: "Deactivate membership",
  });
  await deactivate.click();
  await expect(drawer.getByRole("alert")).toHaveText(
    "Another usable Company Admin is required.",
  );
  await deactivate.click();
  await expect(drawer.getByRole("alert")).toHaveText(
    "Operational handover is required before this change.",
  );
  await deactivate.click();
  await expect(
    page.getByRole("table").getByText("Inactive", { exact: true }),
  ).toBeVisible();
  expect(posts).toEqual([
    { expectedVersion: 1 },
    { expectedVersion: 1 },
    { expectedVersion: 1 },
  ]);
});
