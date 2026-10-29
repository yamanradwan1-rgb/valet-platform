import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const countsPath = `${overview}/session-state-counts`;
const livePath = `${overview}/live-sessions`;

function parkingCounts(parking) {
  return { counts: stateCounts().counts.map((entry) => entry.state === "PARKING"
    ? { ...entry, count: parking } : entry) };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function enter(page) {
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

function liveResponse() {
  return { body: {
    items: [sessionItem({
      checkedInBy: null, parkedBy: null, parkingCompletionProof: "NO_RECORD",
    })],
    nextCursor: null,
  } };
}

test("count failure retries rows and counts, with no reads hidden or offline", async ({ page }) => {
  let parking = 1;
  let attempts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === livePath) return liveResponse();
      if (path !== countsPath) return undefined;
      attempts += 1;
      return attempts === 1
        ? { status: 503, body: { code: "TEMPORARY_UNAVAILABLE", message: "Offline fixture", requestId: "r354" } }
        : { body: parkingCounts(parking) };
    },
  });
  await fixture.install(page);
  await enter(page);
  const transit = page.getByText("In Transit").locator("..");
  await expect(transit.getByText("—", { exact: true })).toBeVisible();
  const originalRows = fixture.count(livePath);
  await page.getByRole("button", { name: "Metrics unavailable · Retry" }).click();
  await expect(transit.getByText("2", { exact: true })).toBeVisible();
  expect(fixture.count(livePath)).toBeGreaterThan(originalRows);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  parking = 0;
  const beforeHidden = fixture.count(countsPath);
  await page.getByRole("button", { name: "Parked", exact: true }).click();
  await page.waitForTimeout(150);
  expect(fixture.count(countsPath)).toBe(beforeHidden);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(transit.getByText("1", { exact: true })).toBeVisible();
  const afterVisible = fixture.count(countsPath);
  expect(afterVisible).toBeGreaterThan(beforeHidden);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
  });
  await expect(page.locator('[class*="liveInlineError"][role="alert"]')).toBeVisible();
  await expect(page.getByText("No current data is available.")).toHaveCount(0);
  parking = 1;
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.waitForTimeout(150);
  expect(fixture.count(countsPath)).toBe(afterVisible);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });
  await expect(transit.getByText("2", { exact: true })).toBeVisible();
  const stableCount = fixture.count(countsPath);
  await page.waitForTimeout(300);
  expect(fixture.count(countsPath)).toBe(stableCount);
});

test("aborted older counts response never repaints the newest list revision", async ({ page }) => {
  const releaseStale = deferred();
  let attempts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path === livePath) return liveResponse();
      if (path !== countsPath) return undefined;
      attempts += 1;
      if (attempts === 2) {
        await releaseStale.promise;
        return { body: parkingCounts(6) }; // superseded response
      }
      return { body: parkingCounts(attempts === 1 ? 1 : 0) };
    },
  });
  await fixture.install(page);
  await enter(page);
  const transit = page.getByText("In Transit").locator("..");
  await expect(transit.getByText("2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Parked", exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(transit.getByText("1", { exact: true })).toBeVisible();
  releaseStale.resolve();
  await page.waitForTimeout(300);
  await expect(transit.getByText("1", { exact: true })).toBeVisible();
  expect(attempts).toBe(3);
});
