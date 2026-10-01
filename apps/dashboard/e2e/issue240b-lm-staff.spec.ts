import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  activeShiftsPath,
  STAFF_EMAIL,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { persistentMatches } from "./support/persistent-storage";

const directory = staffPath(ORG_A.organizationId);
const detailPath = `${directory}/${staffItem().membershipId}`;
const grantPage = `${detailPath}/location-access`;
const candidates = `${grantPage}/candidates`;

function grantItem(location = LOCATION_A) {
  return {
    code: location.code,
    locationId: location.locationId,
    name: location.name,
    status: location.status,
  };
}

async function signInLmEmployees(page: Page) {
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.getByRole("heading", { name: "Employees & Shifts" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Employees", exact: true }).click();
}

test("T05-B LM reuses Employees UI with lower-role controls and bounded grant management", async ({
  page,
}) => {
  const posts: unknown[] = [];
  let version = 1;
  let grantedB = false;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
    },
    override: (path, request) => {
      const query = new URL(request.url()).searchParams;
      if (path === activeShiftsPath(LOCATION_A.locationId))
        return { body: { items: [], nextCursor: null } };
      if (path === directory)
        return {
          body: {
            items: [
              staffItem({ locationAccessCount: grantedB ? 2 : 1, version }),
            ],
            nextCursor: null,
          },
        };
      if (path === detailPath)
        return {
          body: staffDetail({
            locationAccessCount: grantedB ? 2 : 1,
            version,
          }),
        };
      if (path === grantPage && request.method() === "GET") {
        const second = query.has("cursor");
        return {
          body: {
            items: [grantItem(second ? LOCATION_B : LOCATION_A)],
            nextCursor: second ? null : "GRANT_NEXT",
          },
        };
      }
      if (path === candidates && request.method() === "GET")
        return {
          body: {
            items: [
              { ...grantItem(LOCATION_A), granted: true },
              { ...grantItem(LOCATION_B), granted: grantedB },
            ],
            nextCursor: null,
          },
        };
      if (path === `${grantPage}/grant` && request.method() === "POST") {
        posts.push(request.postDataJSON());
        version = 2;
        grantedB = true;
        return {
          body: staffDetail({ locationAccessCount: 2, version }),
          delayMs: 120,
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInLmEmployees(page);
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  expect(fixture.count(directory)).toBe(1);

  const roleFilter = page.getByRole("combobox", { name: "Role" });
  expect(
    await roleFilter
      .locator("option")
      .evaluateAll((items) => items.map((item) => item.getAttribute("value"))),
  ).toEqual(["ALL", "VALET_SUPERVISOR", "VALET_EMPLOYEE"]);
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const role = drawer.getByRole("combobox", { name: "Role" });
  expect(
    await role
      .locator("option")
      .evaluateAll((items) => items.map((item) => item.getAttribute("value"))),
  ).toEqual(["VALET_SUPERVISOR", "VALET_EMPLOYEE"]);

  await expect(
    drawer.getByText(LOCATION_A.name, { exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByText(LOCATION_A.code, { exact: true }),
  ).toBeVisible();
  expect(fixture.count(grantPage)).toBe(1);
  await page.waitForTimeout(250);
  expect(fixture.count(grantPage)).toBe(1);
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    drawer.getByText(LOCATION_B.name, { exact: true }),
  ).toBeVisible();
  expect(fixture.count(grantPage)).toBe(2);
  await expect(
    drawer.getByText(LOCATION_A.locationId, { exact: true }),
  ).toHaveCount(0);

  await drawer
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  const assignment = page.getByRole("dialog", { name: "Location grants" });
  await expect(assignment).toBeVisible();
  expect(fixture.count(candidates)).toBe(1);
  const current = assignment
    .locator("label")
    .filter({ hasText: LOCATION_A.name });
  const available = assignment
    .locator("label")
    .filter({ hasText: LOCATION_B.name });
  await expect(current.getByText("Granted", { exact: true })).toBeVisible();
  await expect(current.getByRole("checkbox")).toBeDisabled();
  await expect(
    available.getByText("Not granted", { exact: true }),
  ).toBeVisible();
  await available.getByRole("checkbox").check();
  await assignment
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts).toEqual([
    { expectedVersion: 1, locationIds: [LOCATION_B.locationId] },
  ]);
  await expect(assignment).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(posts).toHaveLength(1);
  expect(fixture.count(candidates)).toBe(1);

  for (const sentinel of [STAFF_EMAIL, LOCATION_A.name, LOCATION_B.name]) {
    expect(await persistentMatches(page, sentinel)).toEqual({
      local: [],
      session: [],
      indexed: [],
      cache: [],
    });
  }
});

test("T05-B Location assignment caps one explicit command at 50 and requires a second submit", async ({
  page,
}) => {
  const ids = Array.from(
    { length: 51 },
    (_, index) => `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const posts: Array<{ expectedVersion: number; locationIds: string[] }> = [];
  let version = 1;
  const granted = new Set<string>();
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      const query = new URL(request.url()).searchParams;
      if (path === activeShiftsPath(LOCATION_A.locationId))
        return { body: { items: [], nextCursor: null } };
      if (path === directory)
        return {
          body: {
            items: [
              staffItem({ locationAccessCount: 1 + granted.size, version }),
            ],
            nextCursor: null,
          },
        };
      if (path === detailPath)
        return {
          body: staffDetail({ locationAccessCount: 1 + granted.size, version }),
        };
      if (path === grantPage && request.method() === "GET")
        return { body: { items: [grantItem()], nextCursor: null } };
      if (path === candidates && request.method() === "GET") {
        const pageIds = query.has("cursor") ? ids.slice(50) : ids.slice(0, 50);
        return {
          body: {
            items: pageIds.map((locationId, index) => ({
              code: `C-${query.has("cursor") ? 50 + index : index}`,
              granted: granted.has(locationId),
              locationId,
              name: `Candidate ${query.has("cursor") ? 50 + index : index}`,
              status: "ACTIVE",
            })),
            nextCursor: query.has("cursor") ? null : "CANDIDATE_NEXT",
          },
        };
      }
      if (path === `${grantPage}/grant` && request.method() === "POST") {
        const body = request.postDataJSON() as {
          expectedVersion: number;
          locationIds: string[];
        };
        posts.push(body);
        body.locationIds.forEach((id) => granted.add(id));
        version += 1;
        return {
          body: staffDetail({ locationAccessCount: 1 + granted.size, version }),
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInLmEmployees(page);
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog");
  await drawer
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  let assignment = page.getByRole("dialog", { name: "Location grants" });
  for (const box of await assignment.getByRole("checkbox").all())
    await box.check();
  await assignment.getByRole("button", { name: "Next", exact: true }).click();
  const fiftyFirst = assignment.getByRole("checkbox");
  await expect(fiftyFirst).toBeDisabled();
  await assignment
    .getByRole("button", { name: "Previous", exact: true })
    .click();
  await assignment
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    expectedVersion: 1,
    locationIds: ids.slice(0, 50),
  });

  await drawer
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  assignment = page.getByRole("dialog", { name: "Location grants" });
  await assignment.getByRole("button", { name: "Next", exact: true }).click();
  await assignment.getByRole("checkbox").check();
  await assignment
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({ expectedVersion: 2, locationIds: [ids[50]!] });
  expect(fixture.count(`${grantPage}/grant`)).toBe(2);
});
