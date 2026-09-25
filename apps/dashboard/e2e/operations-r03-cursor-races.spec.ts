import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";

const base = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/overview`;
const sessions = (locationId: string) => `${base(locationId)}/sessions`;
const counts = (locationId: string) =>
  `${base(locationId)}/session-state-counts`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function row(
  descriptor: string,
  suffix: string,
  state: "PARKED" | "PARKING" = "PARKED",
) {
  return sessionItem({
    sessionId: `77777777-7777-4777-8777-7777777777${suffix}`,
    state,
    vehicle: {
      vehicleId: `88888888-8888-4888-8888-8888888888${suffix}`,
      plateCountry: null,
      plateNumberNormalized: null,
      temporaryDescriptor: descriptor,
    },
  });
}

async function enterLocation(page: Page, locationName: string) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

test("R03 preserves opaque session cursor next/previous and resets loaded-page filter", async ({ page }) => {
  const seen: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === counts(LOCATION_A.locationId)) return { body: stateCounts() };
      if (path !== sessions(LOCATION_A.locationId)) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      seen.push(cursor);
      return cursor === null
        ? { body: { items: [row("First cursor page", "21")], nextCursor: "cursor_A_12345678" } }
        : { body: { items: [row("Second cursor page", "22", "PARKING")], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await expect(page.getByText("First cursor page")).toBeVisible();

  await page.getByRole("button", { name: "Parked", exact: true }).click();
  await expect(page.getByRole("button", { name: "Parked", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Second cursor page")).toBeVisible();
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(seen).toContain("cursor_A_12345678");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("First cursor page")).toBeVisible();
  expect(seen.filter((cursor) => cursor === null).length).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/Page \d+ of \d+/u)).toHaveCount(0);
});

test("R03 never sends Location A page-2 cursor to Location B or repaints its delayed rows", async ({ page }) => {
  const releasePageTwo = deferred();
  const pageTwoStarted = deferred();
  const seenB: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request) => {
      if (path === counts(LOCATION_A.locationId) || path === counts(LOCATION_B.locationId)) {
        return { body: stateCounts() };
      }
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === sessions(LOCATION_A.locationId) && cursor === null) {
        return { body: { items: [row("Location A first page", "31")], nextCursor: "cursor_A_87654321" } };
      }
      if (path === sessions(LOCATION_A.locationId) && cursor !== null) {
        pageTwoStarted.resolve();
        await releasePageTwo.promise;
        return { body: { items: [row("Delayed A page two", "32")], nextCursor: null } };
      }
      if (path === sessions(LOCATION_B.locationId)) {
        seenB.push(cursor);
        return { body: { items: [row("Location B current", "33")], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await expect(page.getByText("Location A first page")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await pageTwoStarted.promise;

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await enterLocation(page, LOCATION_B.name);
  await expect(page.getByText("Location B current")).toBeVisible();
  expect(seenB.every((cursor) => cursor === null)).toBe(true);
  releasePageTwo.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Delayed A page two")).toHaveCount(0);
  await expect(page.getByText("Location B current")).toBeVisible();
});

for (const mode of ["success", "failure"] as const) {
  test(`R03 A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const releaseFirstA = deferred();
    const firstAStarted = deferred();
    let aCalls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path) => {
        if (path === counts(LOCATION_A.locationId) || path === counts(LOCATION_B.locationId)) {
          return { body: stateCounts() };
        }
        if (path === sessions(LOCATION_A.locationId)) {
          aCalls += 1;
          if (aCalls === 1) {
            firstAStarted.resolve();
            await releaseFirstA.promise;
            return mode === "success"
              ? { body: { items: [row("Stale first A", "41")], nextCursor: null } }
              : { status: 503, body: { code: "TEMPORARY", message: "stale failure", requestId: "r03-stale" } };
          }
          return { body: { items: [row("Fresh final A", "42")], nextCursor: null } };
        }
        if (path === sessions(LOCATION_B.locationId)) {
          return { body: { items: [row("Middle B", "43")], nextCursor: null } };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await page.goto("/live-operations");
    await signInOnCurrentPage(page);
    await enterLocation(page, LOCATION_A.name);
    await firstAStarted.promise;

    await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
    await enterLocation(page, LOCATION_B.name);
    await expect(page.getByText("Middle B")).toBeVisible();
    await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
    await enterLocation(page, LOCATION_A.name);
    await expect(page.getByText("Fresh final A")).toBeVisible();

    releaseFirstA.resolve();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Stale first A")).toHaveCount(0);
    await expect(page.getByText("Fresh final A")).toBeVisible();
    await expect(page.getByText("stale failure")).toHaveCount(0);
  });
}

test("R03 pending session read cannot reappear after logout", async ({ page }) => {
  const release = deferred();
  const started = deferred();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path === counts(LOCATION_A.locationId)) return { body: stateCounts() };
      if (path === sessions(LOCATION_A.locationId)) {
        started.resolve();
        await release.promise;
        return { body: { items: [row("Late after logout", "51")], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await started.promise;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Late after logout")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
});
