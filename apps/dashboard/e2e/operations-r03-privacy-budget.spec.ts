import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";
import { persistentMatches } from "./support/persistent-storage";

const sentinel = "R03_STORAGE_SENTINEL_84271";
const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;

test("R03 keeps Live Operations memory-only and request budget settles without polling", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${overview}/sessions`) {
        return {
          body: {
            items: [
              sessionItem({
                vehicle: {
                  ...sessionItem().vehicle,
                  plateNumberNormalized: null,
                  temporaryDescriptor: sentinel,
                },
              }),
            ],
            nextCursor: null,
          },
        };
      }
      if (path === `${overview}/session-state-counts`) {
        return { body: stateCounts() };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText(sentinel, { exact: true })).toBeVisible();

  const sessionsPath = `${overview}/sessions`;
  const countsPath = `${overview}/session-state-counts`;
  await expect.poll(() => fixture.count(sessionsPath)).toBeGreaterThan(0);
  await expect.poll(() => fixture.count(countsPath)).toBeGreaterThan(0);
  const settled = {
    sessions: fixture.count(sessionsPath),
    counts: fixture.count(countsPath),
  };
  await page.waitForTimeout(750);
  expect(fixture.count(sessionsPath)).toBe(settled.sessions);
  expect(fixture.count(countsPath)).toBe(settled.counts);
  expect(fixture.count(`${overview}/retrieval-queue`)).toBe(0);
  expect(fixture.count(`${overview}/tasks`)).toBe(0);

  const storage = await persistentMatches(page, sentinel);
  expect(storage.local).toEqual([]);
  expect(storage.session).toEqual([]);
  expect(storage.indexed).toEqual([]);
  expect(storage.cache).toEqual([]);
});
