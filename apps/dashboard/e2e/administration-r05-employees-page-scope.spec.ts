import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { staffItem, staffPath } from "./support/administration-r05-fixtures";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function signInCompany(page: Page, locationName: string | null = null) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: locationName ?? "All Locations" })
    .click();
}

test("R05 Employees never carries Organization A cursor into B or repaints delayed A", async ({
  page,
}) => {
  const pathA = staffPath(ORG_A.organizationId);
  const pathB = staffPath(ORG_B.organizationId);
  const release = deferred();
  const started = deferred();
  const seenB: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    override: async (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === pathA && cursor === null)
        return {
          body: { items: [staffItem()], nextCursor: "org_A_cursor_12345678" },
        };
      if (path === pathA && cursor) {
        started.resolve();
        await release.promise;
        return {
          body: {
            items: [staffItem({ identity: { email: "stale-a@example.com" } })],
            nextCursor: null,
          },
        };
      }
      if (path === pathB) {
        seenB.push(cursor);
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
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await started.promise;
  await page.locator(".sidebar-scope").click();
  await page.getByRole("button", { name: ORG_B.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(
    page.getByText("bravo@example.com", { exact: true }),
  ).toBeVisible();
  expect(seenB.length).toBeGreaterThan(0);
  expect(seenB.every((cursor) => cursor === null)).toBe(true);
  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("stale-a@example.com", { exact: true }),
  ).toHaveCount(0);
});
