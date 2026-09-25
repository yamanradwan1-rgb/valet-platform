import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { taskItem } from "./support/operations-fixtures";

const tasks = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/overview/tasks`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function enterLocation(page: Page, locationName: string) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

for (const mode of ["success", "failure"] as const) {
  test(`R04 Tasks A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const releaseFirstA = deferred();
    const firstAStarted = deferred();
    let aCalls = 0;
    const seenACursors: Array<string | null> = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path, request) => {
        if (path === tasks(LOCATION_A.locationId)) {
          const cursor = new URL(request.url()).searchParams.get("cursor");
          seenACursors.push(cursor);
          aCalls += 1;
          if (aCalls === 1) {
            firstAStarted.resolve();
            await releaseFirstA.promise;
            return mode === "success"
              ? { body: { items: [taskItem({ taskType: "RETRIEVAL", status: "CANCELLED" })], nextCursor: null } }
              : { status: 503, body: { code: "TEMPORARY", message: "stale task failure", requestId: "r04-stale" } };
          }
          return { body: { items: [taskItem({ taskType: "PARKING", status: "COMPLETED" })], nextCursor: null } };
        }
        if (path === tasks(LOCATION_B.locationId)) {
          return { body: { items: [taskItem({ taskType: "RETRIEVAL", status: "ACCEPTED" })], nextCursor: null } };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await page.goto("/tasks");
    await signInOnCurrentPage(page);
    await enterLocation(page, LOCATION_A.name);
    await firstAStarted.promise;

    await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
    await enterLocation(page, LOCATION_B.name);
    await expect(page.getByRole("table").getByText("Accepted", { exact: true })).toBeVisible();
    await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
    await enterLocation(page, LOCATION_A.name);
    await expect(page.getByRole("table").getByText("Completed", { exact: true })).toBeVisible();
    expect(seenACursors.at(-1)).toBeNull();

    releaseFirstA.resolve();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("table").getByText("Cancelled", { exact: true })).toHaveCount(0);
    await expect(page.getByText("stale task failure", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("table").getByText("Completed", { exact: true })).toBeVisible();
  });
}

test("R04 pending Tasks read cannot repaint after logout", async ({ page }) => {
  const release = deferred();
  const started = deferred();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path !== tasks(LOCATION_A.locationId)) return undefined;
      started.resolve();
      await release.promise;
      return { body: { items: [taskItem({ taskType: "RETRIEVAL", status: "CANCELLED" })], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await started.promise;

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Cancelled", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
});
