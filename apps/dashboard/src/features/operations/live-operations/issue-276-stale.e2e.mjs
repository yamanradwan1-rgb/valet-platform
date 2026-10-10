import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, LOCATION_B, ORG_A,
} from "../../../../e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../../../../e2e/support/foundation-ui";
import { sessionItem, stateCounts } from "../../../../e2e/support/operations-fixtures";

const livePath = (id) =>
  `/v1/staff/dashboard/locations/${id}/overview/live-sessions`;
const countsPath = (id) =>
  `/v1/staff/dashboard/locations/${id}/overview/session-state-counts`;

function row(suffix, descriptor, parker) {
  return sessionItem({
    sessionId: `77777777-7777-4777-8777-7777777777${suffix}`,
    currentAssigneeMembershipId: null,
    activeTask: null,
    vehicle: {
      vehicleId: `88888888-8888-4888-8888-8888888888${suffix}`,
      plateCountry: null,
      plateNumberNormalized: null,
      make: null,
      model: null,
      color: null,
      temporaryDescriptor: descriptor,
    },
    checkedInBy: { firstName: "Synthetic", lastName: "Checker" },
    parkedBy: { firstName: parker, lastName: "Parker" },
    parkingCompletionProof: "PROVEN",
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function switchLocation(page, name) {
  await page.locator("button.location-context").click();
  const option = page.getByRole("option", { name });
  await expect(option).toBeVisible();
  await option.click();
}

test("delayed first A success cannot repaint historical Parker after A→B→A", async ({ page }) => {
  const releaseFirstA = deferred();
  let aRequests = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path) => {
      if ([countsPath(LOCATION_A.locationId), countsPath(LOCATION_B.locationId)]
        .includes(path)) return { body: stateCounts() };
      if (path === livePath(LOCATION_A.locationId)) {
        aRequests++;
        if (aRequests === 1) {
          await releaseFirstA.promise;
          return {
            body: { items: [row("51", "Stale A", "StaleA")], nextCursor: null },
          };
        }
        return {
          body: { items: [row("52", "Fresh A", "FreshA")], nextCursor: null },
        };
      }
      if (path === livePath(LOCATION_B.locationId)) {
        return {
          body: { items: [row("53", "Scoped B", "ScopedB")], nextCursor: null },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect.poll(() => aRequests).toBe(1);

  await switchLocation(page, LOCATION_B.name);
  await expect(page.getByRole("table")).toContainText("ScopedB Parker");
  await page.getByRole("table").getByRole("button", { name: /Details/u }).click();
  await expect(page.getByRole("dialog")).toContainText("ScopedB Parker");
  // External scope proof can complete while the old historical drawer is open.
  await page.locator("button.location-context")
    .evaluate((button) => button.click());
  await page.getByRole("option", { name: LOCATION_A.name })
    .evaluate((option) => option.click());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("FreshA Parker");
  releaseFirstA.resolve();
  await expect(page.getByText("StaleA Parker")).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("FreshA Parker");
  expect(aRequests).toBeGreaterThanOrEqual(2);
});
