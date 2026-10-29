import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, LOCATION_B, ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";

const countsPath = (locationId) =>
  `/v1/staff/dashboard/locations/${locationId}/overview/session-state-counts`;
const livePath = (locationId) =>
  `/v1/staff/dashboard/locations/${locationId}/overview/live-sessions`;

function countsWithParking(parking) {
  return { counts: stateCounts().counts.map((entry) => entry.state === "PARKING"
    ? { ...entry, count: parking } : entry) };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function switchLocation(page, name) {
  await page.locator("button.location-context").click();
  await page.getByRole("option", { name }).click();
}

test("scope A→B→A and logout fence delayed count responses", async ({ page }) => {
  const releaseFirstA = deferred();
  let aReads = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path) => {
      if (path === countsPath(LOCATION_A.locationId)) {
        aReads += 1;
        if (aReads === 1) {
          await releaseFirstA.promise;
          return { body: countsWithParking(1) }; // delayed stale A: transit=2
        }
        return { body: countsWithParking(0) }; // current A: transit=1
      }
      if (path === countsPath(LOCATION_B.locationId)) {
        return { body: countsWithParking(6) }; // B: transit=7
      }
      if ([livePath(LOCATION_A.locationId), livePath(LOCATION_B.locationId)]
        .includes(path)) {
        return { body: {
          items: [sessionItem({
            checkedInBy: null, parkedBy: null, parkingCompletionProof: "NO_RECORD",
          })],
          nextCursor: null,
        } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect.poll(() => aReads).toBe(1);

  await switchLocation(page, LOCATION_B.name);
  const transit = page.getByText("In Transit").locator("..");
  await expect(transit.getByText("7", { exact: true })).toBeVisible();
  await switchLocation(page, LOCATION_A.name);
  await expect(transit.getByText("1", { exact: true })).toBeVisible();
  releaseFirstA.resolve();
  await page.waitForTimeout(250);
  await expect(transit.getByText("1", { exact: true })).toBeVisible();
  expect(aReads).toBeGreaterThanOrEqual(2);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("In Transit")).toHaveCount(0);
});

test("403 revocation clears protected rows and stale in-flight counts stay fenced", async ({ page }) => {
  const releaseStale = deferred();
  let countsReads = 0;
  let revoked = false;
  const trace = [];
  const denied = { status: 403, body: {
    code: "AUTHORIZATION_DENIED", message: "Scope revoked", requestId: "r354-revoked",
  } };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path === countsPath(LOCATION_A.locationId)) {
        countsReads += 1;
        if (countsReads === 2) {
          trace.push("counts:stale-pending");
          await releaseStale.promise;
          trace.push("counts:stale-200");
          return { body: countsWithParking(8) };
        }
        if (revoked) {
          trace.push("counts:403");
          return denied;
        }
        trace.push("counts:200");
        return { body: countsWithParking(1) };
      }
      if (path === livePath(LOCATION_A.locationId)) {
        trace.push(`live:${revoked ? "403" : "200"}`);
        return revoked ? denied : { body: { items: [sessionItem({
          checkedInBy: null, parkedBy: null, parkingCompletionProof: "NO_RECORD",
        })], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  const transit = page.getByText("In Transit").locator("..");
  await expect(transit.getByText("2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Details:/ })).toHaveCount(1);

  const focusResume = async () => page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await focusResume();
  await expect.poll(() => countsReads).toBe(2);
  revoked = true;
  await focusResume();
  await expect.poll(() => countsReads).toBe(3);
  await expect(transit.getByText("—", { exact: true })).toBeVisible();
  await expect(page.getByText("Scope revoked")).toBeVisible();
  await expect(page.getByRole("button", { name: /Details:/ })).toHaveCount(0);

  releaseStale.resolve();
  await page.waitForTimeout(300);
  await expect(transit.getByText("—", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Details:/ })).toHaveCount(0);
  expect(countsReads).toBe(3);
  console.log(`ISSUE354_REVOKED_TRACE=${JSON.stringify(trace)}`);
});
