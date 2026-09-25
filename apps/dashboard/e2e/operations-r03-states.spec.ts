import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const sessionsPath = `${overview}/sessions`;
const countsPath = `${overview}/session-state-counts`;

async function enterLiveOperations(page: import("@playwright/test").Page) {
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

test("R03 empty sessions preserve the reference-shaped table without invented zero totals", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === sessionsPath) return { body: { items: [], nextCursor: null } };
      if (path === countsPath) return { body: stateCounts() };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLiveOperations(page);
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Vehicle" })).toBeVisible();
  await expect(page.getByText("No current data is available.")).toBeVisible();
  await expect(page.getByText("Active Sessions").locator("..").getByText("15", { exact: true })).toBeVisible();
});

test("R03 cursor failure clears prior rows, exposes Retry, and retries only the current cursor", async ({ page }) => {
  let pageTwoAttempts = 0;
  const seenCursors: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === countsPath) return { body: stateCounts() };
      if (path !== sessionsPath) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      seenCursors.push(cursor);
      if (cursor === null) {
        return {
          body: {
            items: [sessionItem({
              vehicle: {
                ...sessionItem().vehicle,
                plateNumberNormalized: null,
                temporaryDescriptor: "Previous page row",
              },
            })],
            nextCursor: "cursor_retry_12345678",
          },
        };
      }
      pageTwoAttempts += 1;
      if (pageTwoAttempts === 1) {
        return {
          status: 503,
          body: {
            code: "TEMPORARY_UNAVAILABLE",
            message: "Temporary read failure",
            requestId: "r03-retry",
          },
        };
      }
      return {
        body: {
          items: [sessionItem({
            sessionId: "77777777-7777-4777-8777-777777777721",
            vehicle: {
              ...sessionItem().vehicle,
              vehicleId: "77777777-7777-4777-8777-777777777722",
              plateNumberNormalized: null,
              temporaryDescriptor: "Fresh retry row",
            },
          })],
          nextCursor: null,
        },
      };
    },
  });
  await fixture.install(page);
  await enterLiveOperations(page);
  await expect(page.getByText("Previous page row")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator('[class*="liveInlineError"][role="alert"]')).toContainText("Temporary read failure");
  await expect(page.getByText("Previous page row")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Fresh retry row")).toBeVisible();
  expect(seenCursors.at(-1)).toBe("cursor_retry_12345678");
  expect(pageTwoAttempts).toBe(2);
});

test("R03 keeps the existing single GET 401 refresh/replay reconciliation", async ({ page }) => {
  let attempts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === countsPath) return { body: stateCounts() };
      if (path !== sessionsPath) return undefined;
      attempts += 1;
      if (attempts === 1) {
        return {
          status: 401,
          body: {
            code: "STAFF_AUTHENTICATION_REQUIRED",
            message: "Authentication required",
            requestId: "r03-401",
          },
        };
      }
      return {
        body: {
          items: [sessionItem({
            vehicle: {
              ...sessionItem().vehicle,
              plateNumberNormalized: null,
              temporaryDescriptor: "After auth replay",
            },
          })],
          nextCursor: null,
        },
      };
    },
  });
  await fixture.install(page);
  await enterLiveOperations(page);
  await expect(page.getByText("After auth replay")).toBeVisible();
  expect(attempts).toBe(2);
  expect(fixture.count("/v1/staff/auth/refresh")).toBeGreaterThan(0);
});

test("R03 count failure never becomes fake zero and exposes focused recovery", async ({ page }) => {
  let countAttempts = 0;
  let allowRecovery = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === sessionsPath) {
        return { body: { items: [sessionItem()], nextCursor: null } };
      }
      if (path === countsPath) {
        countAttempts += 1;
        return !allowRecovery
          ? {
              status: 503,
              body: {
                code: "TEMPORARY_UNAVAILABLE",
                message: "Metrics unavailable",
                requestId: "r03-counts",
              },
            }
          : { body: stateCounts() };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLiveOperations(page);
  const active = page.getByText("Active Sessions").locator("..");
  await expect(active.getByText("—", { exact: true })).toBeVisible();
  allowRecovery = true;
  await page.getByRole("button", { name: "Metrics unavailable · Retry" }).click();
  await expect(active.getByText("15", { exact: true })).toBeVisible();
  expect(countAttempts).toBeGreaterThanOrEqual(2);
});
