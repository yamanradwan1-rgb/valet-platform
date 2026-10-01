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
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";

async function openDetail(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  return page.getByRole("dialog", { name: "Details" });
}

test("T05-B CA truncated detail uses bounded grant paging and revoke dispatches once", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const grantPage = `${detailPath}/location-access`;
  const revokePath = `${detailPath}/location-access/revoke`;
  const posts: unknown[] = [];
  const truncated = staffDetail({
    locationAccessCount: 101,
    locationAccess: {
      items: [
        {
          locationId: LOCATION_A.locationId,
          name: LOCATION_A.name,
          status: "ACTIVE",
        },
      ],
      totalCount: 101,
      truncated: true,
    },
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === directory)
        return {
          body: {
            items: [staffItem({ locationAccessCount: 101 })],
            nextCursor: null,
          },
        };
      if (path === detailPath) return { body: truncated };
      if (path === grantPage && request.method() === "GET")
        return {
          body: {
            items: [
              {
                code: LOCATION_A.code,
                locationId: LOCATION_A.locationId,
                name: LOCATION_A.name,
                status: "ACTIVE",
              },
            ],
            nextCursor: "MORE_GRANTS",
          },
        };
      if (path === revokePath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        return { body: { ...truncated, version: 2 }, delayMs: 250 };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture);
  await expect(
    drawer.getByText(LOCATION_A.code, { exact: true }),
  ).toBeVisible();
  expect(fixture.count(grantPage)).toBe(1);
  await drawer.getByRole("checkbox").check();
  await drawer.getByRole("button", { name: "Revoke" }).dblclick();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({
    expectedVersion: 1,
    locationIds: [LOCATION_A.locationId],
  });
});

test("T05-B CA grant keeps one explicit expectedVersion command", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const grantPage = `${detailPath}/location-access`;
  const candidates = `${grantPage}/candidates`;
  const grantPath = `${detailPath}/location-access/grant`;
  const posts: unknown[] = [];
  let granted = false;
  const emptyDetail = staffDetail({
    locationAccessCount: 0,
    locationAccess: { items: [], totalCount: 0, truncated: false },
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === directory)
        return {
          body: {
            items: [
              staffItem({
                locationAccessCount: granted ? 1 : 0,
                version: granted ? 2 : 1,
              }),
            ],
            nextCursor: null,
          },
        };
      if (path === detailPath)
        return { body: granted ? staffDetail({ version: 2 }) : emptyDetail };
      if (path === grantPage && request.method() === "GET")
        return {
          body: {
            items: granted
              ? [
                  {
                    code: LOCATION_A.code,
                    locationId: LOCATION_A.locationId,
                    name: LOCATION_A.name,
                    status: "ACTIVE",
                  },
                ]
              : [],
            nextCursor: null,
          },
        };
      if (path === candidates && request.method() === "GET")
        return {
          body: {
            items: [
              {
                code: LOCATION_A.code,
                granted,
                locationId: LOCATION_A.locationId,
                name: LOCATION_A.name,
                status: "ACTIVE",
              },
            ],
            nextCursor: null,
          },
        };
      if (path === grantPath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        granted = true;
        return { body: staffDetail({ version: 2 }) };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture);
  await drawer
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  const assignment = page.getByRole("dialog", { name: "Location grants" });
  await assignment.getByRole("checkbox").check();
  await assignment
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({
    expectedVersion: 1,
    locationIds: [LOCATION_A.locationId],
  });
});
