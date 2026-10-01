import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { staffItem, staffPath } from "./support/administration-r05-fixtures";
import {
  deferred,
  signInCompany,
  changeOrganization,
} from "./support/staff-directory-ui";
test("R05 Employees resets cursor history when returning A after B", async ({
  page,
}) => {
  const pathA = staffPath(ORG_A.organizationId);
  const pathB = staffPath(ORG_B.organizationId);
  const seenA: Array<string | null> = [];
  const seenB: Array<string | null> = [];
  const oldPageStarted = deferred();
  const oldPageRelease = deferred();
  let returningA = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    override: async (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === pathA) {
        seenA.push(cursor);
        if (cursor === "A_CURSOR") {
          oldPageStarted.resolve();
          await oldPageRelease.promise;
          return {
            body: {
              items: [
                staffItem({ identity: { email: "stale-a-page2@example.com" } }),
              ],
              nextCursor: null,
            },
          };
        }
        const email = returningA
          ? "a-return@example.com"
          : "a-first@example.com";
        return {
          body: {
            items: [staffItem({ identity: { email } })],
            nextCursor: returningA ? null : "A_CURSOR",
          },
        };
      }
      if (path === pathB) {
        seenB.push(cursor);
        return cursor === null
          ? {
              body: {
                items: [
                  staffItem({ identity: { email: "b-first@example.com" } }),
                ],
                nextCursor: "B_CURSOR",
              },
            }
          : {
              body: {
                items: [
                  staffItem({ identity: { email: "b-second@example.com" } }),
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
  await expect(
    page.getByText("a-first@example.com", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await oldPageStarted.promise;

  await changeOrganization(page, ORG_B.name);
  await expect(
    page.getByText("b-first@example.com", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("b-second@example.com", { exact: true }),
  ).toBeVisible();
  const aSeenBeforeReturn = seenA.length;
  returningA = true;
  await changeOrganization(page, ORG_A.name);
  await expect(
    page.getByText("a-return@example.com", { exact: true }),
  ).toBeVisible();

  const returnCursors = seenA.slice(aSeenBeforeReturn);
  expect(returnCursors.length).toBeGreaterThan(0);
  expect(returnCursors.every((cursor) => cursor === null)).toBe(true);
  expect(seenA).toContain("A_CURSOR");
  expect(seenB).toContain("B_CURSOR");
  expect(seenA).not.toContain("B_CURSOR");
  expect(seenB).not.toContain("A_CURSOR");
  oldPageRelease.resolve();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("a-return@example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("stale-a-page2@example.com", { exact: true }),
  ).toHaveCount(0);
});
