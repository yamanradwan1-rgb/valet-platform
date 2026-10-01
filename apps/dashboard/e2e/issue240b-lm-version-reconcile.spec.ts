import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  STAFF_EMAIL,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { deferred } from "./support/staff-directory-ui";

const locationC = {
  ...LOCATION_B,
  code: "C-03",
  locationId: "99999999-9999-4999-8999-999999999999",
  name: "Overflow Garage",
};

test("T05-B second explicit grant uses the mutation result version while detail refresh is pending", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${staffItem().membershipId}`;
  const candidates = `${detailPath}/location-access/candidates`;
  const grant = `${detailPath}/location-access/grant`;
  const refreshStarted = deferred();
  const releaseRefresh = deferred();
  const granted = new Set<string>();
  const posts: Array<{ expectedVersion: number; locationIds: string[] }> = [];
  let version = 1;
  let detailReads = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, LOCATION_B, locationC],
    },
    override: async (path, request) => {
      if (path === directory)
        return {
          body: {
            items: [
              staffItem({ locationAccessCount: 1 + granted.size, version }),
            ],
            nextCursor: null,
          },
        };
      if (path === detailPath) {
        detailReads += 1;
        if (detailReads === 2) {
          refreshStarted.resolve();
          await releaseRefresh.promise;
        }
        return {
          body: staffDetail({ locationAccessCount: 1 + granted.size, version }),
        };
      }
      if (path === `${detailPath}/location-access`)
        return {
          body: {
            items: [
              {
                code: LOCATION_A.code,
                locationId: LOCATION_A.locationId,
                name: LOCATION_A.name,
                status: LOCATION_A.status,
              },
            ],
            nextCursor: null,
          },
        };
      if (path === candidates)
        return {
          body: {
            items: [LOCATION_B, locationC].map((location) => ({
              code: location.code,
              granted: granted.has(location.locationId),
              locationId: location.locationId,
              name: location.name,
              status: location.status,
            })),
            nextCursor: null,
          },
        };
      if (path === grant && request.method() === "POST") {
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
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Employees", exact: true }).click();
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog");

  await drawer
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  let dialog = page.getByRole("dialog", { name: "Location grants" });
  await dialog
    .locator("label")
    .filter({ hasText: LOCATION_B.name })
    .getByRole("checkbox")
    .check();
  await dialog
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  await refreshStarted.promise;
  expect(posts[0]).toEqual({
    expectedVersion: 1,
    locationIds: [LOCATION_B.locationId],
  });

  const openAssignment = drawer.getByRole("button", {
    name: "Grant selected Locations",
  });
  await expect(openAssignment).toBeDisabled();
  releaseRefresh.resolve();
  await expect(openAssignment).toBeEnabled();
  await openAssignment.click();
  dialog = page.getByRole("dialog", { name: "Location grants" });
  await dialog
    .locator("label")
    .filter({ hasText: locationC.name })
    .getByRole("checkbox")
    .check();
  await dialog
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({
    expectedVersion: 2,
    locationIds: [locationC.locationId],
  });
  await expect(drawer.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
});
