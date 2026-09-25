import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, taskItem } from "./support/operations-fixtures";

const base = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/overview`;
const sessions = (locationId: string) => `${base(locationId)}/sessions`;
const tasks = (locationId: string) => `${base(locationId)}/tasks`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function enterLocation(page: Page, locationName: string) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

test("R04 Vehicles preserves opaque cursor next/previous and resets loaded-page search", async ({ page }) => {
  const seen: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== sessions(LOCATION_A.locationId)) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      seen.push(cursor);
      if (cursor === null) {
        return {
          body: {
            items: [sessionItem({
              vehicle: { ...sessionItem().vehicle, plateNumberNormalized: "FIRST-11" },
            })],
            nextCursor: "vehicle_cursor_12345678",
          },
        };
      }
      return {
        body: {
          items: [sessionItem({
            sessionId: "77777777-7777-4777-8777-777777777731",
            vehicle: { ...sessionItem().vehicle, plateNumberNormalized: "SECOND-22" },
          })],
          nextCursor: null,
        },
      };
    },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await expect(page.getByText("FIRST-11", { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("FIRST");
  await page.getByRole("combobox", { name: "State" }).selectOption("PARKED");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("SECOND-22", { exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "State" })).toHaveValue("ALL");
  expect(seen).toContain("vehicle_cursor_12345678");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("FIRST-11", { exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "State" })).toHaveValue("ALL");
  expect(seen.filter((cursor) => cursor === null).length).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/Page \d+ of \d+/u)).toHaveCount(0);
});

test("R04 Tasks preserves opaque cursor next/previous and resets loaded-page filters", async ({ page }) => {
  const seen: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== tasks(LOCATION_A.locationId)) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      seen.push(cursor);
      return cursor === null
        ? { body: { items: [taskItem({ taskType: "PARKING", status: "QUEUED" })], nextCursor: "task_cursor_12345678" } }
        : { body: { items: [taskItem({ taskId: "77777777-7777-4777-8777-777777777741", taskType: "RETRIEVAL", status: "COMPLETED" })], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await expect(page.getByRole("table").getByText("Queued", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "State" }).selectOption("QUEUED");
  await page.getByRole("combobox", { name: "Type" }).selectOption("PARKING");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("table").getByText("Retrieval", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "State" })).toHaveValue("ALL");
  await expect(page.getByRole("combobox", { name: "Type" })).toHaveValue("ALL");
  expect(seen).toContain("task_cursor_12345678");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByRole("table").getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "State" })).toHaveValue("ALL");
  await expect(page.getByRole("combobox", { name: "Type" })).toHaveValue("ALL");
  expect(seen.filter((cursor) => cursor === null).length).toBeGreaterThanOrEqual(2);
});

test("R04 never sends Location A task cursor to B or repaints delayed A rows", async ({ page }) => {
  const releasePageTwo = deferred();
  const pageTwoStarted = deferred();
  const seenB: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === tasks(LOCATION_A.locationId) && cursor === null) {
        return { body: { items: [taskItem({ status: "QUEUED" })], nextCursor: "task_A_87654321" } };
      }
      if (path === tasks(LOCATION_A.locationId) && cursor !== null) {
        pageTwoStarted.resolve();
        await releasePageTwo.promise;
        return { body: { items: [taskItem({ taskType: "RETRIEVAL", status: "COMPLETED" })], nextCursor: null } };
      }
      if (path === tasks(LOCATION_B.locationId)) {
        seenB.push(cursor);
        return { body: { items: [taskItem({ taskType: "RETRIEVAL", status: "ACCEPTED" })], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await expect(page.getByRole("table").getByText("Queued", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await pageTwoStarted.promise;

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await enterLocation(page, LOCATION_B.name);
  await expect(page.getByRole("table").getByText("Accepted", { exact: true })).toBeVisible();
  expect(seenB.length).toBeGreaterThan(0);
  expect(seenB.every((cursor) => cursor === null)).toBe(true);
  releasePageTwo.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("table").getByText("Completed", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table").getByText("Accepted", { exact: true })).toBeVisible();
});
