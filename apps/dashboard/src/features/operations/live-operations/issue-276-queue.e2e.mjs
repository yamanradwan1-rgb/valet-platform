import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, LOCATION_B, ORG_A,
} from "../../../../e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../../../../e2e/support/foundation-ui";
import {
  retrievalItem, sessionItem, stateCounts,
} from "../../../../e2e/support/operations-fixtures";

const overview = (id) => `/v1/staff/dashboard/locations/${id}/overview`;
const queuePath = (id) => `${overview(id)}/retrieval-queue`;
const livePath = (id) => `${overview(id)}/live-sessions`;
const countsPath = (id) => `${overview(id)}/session-state-counts`;
const strictLive = () => ({
  items: [{
    ...sessionItem({ activeTask: null, currentAssigneeMembershipId: null }),
    checkedInBy: null, parkedBy: null, parkingCompletionProof: "NO_RECORD",
  }], nextCursor: null,
});

async function enterInitially(page) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}
async function switchLocation(page, location) {
  await page.locator("button.location-context").click();
  const option = page.getByRole("option", { name: location.name });
  await expect(option).toBeVisible();
  await option.click();
}

test("Issue 276 preserves standalone Retrieval Queue: lazy, strict, scope-fenced, without historic identity", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) => {
      if (path === livePath(LOCATION_A.locationId) ||
          path === livePath(LOCATION_B.locationId)) return { body: strictLive() };
      if (path === countsPath(LOCATION_A.locationId) ||
          path === countsPath(LOCATION_B.locationId)) return { body: stateCounts() };
      if (path === queuePath(LOCATION_A.locationId)) {
        return { body: { items: [retrievalItem()], nextCursor: null } };
      }
      if (path === queuePath(LOCATION_B.locationId)) {
        return { body: {
          items: [{ ...retrievalItem(), requesterType: "STAFF", task: null }],
          nextCursor: null,
        } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await enterInitially(page);
  await expect(page.getByRole("heading", { name: "Live Operations" })).toBeVisible();
  expect(fixture.count(queuePath(LOCATION_A.locationId))).toBe(0);

  await page.getByRole("button", { name: "Retrieval Queue", exact: true }).click();
  await expect.poll(() => fixture.count(queuePath(LOCATION_A.locationId))).toBe(1);
  const table = page.getByRole("table");
  for (const heading of ["Requested","Requester","Request Status",
    "Task Status","Assigned To","Actions"]) {
    await expect(table.getByRole("columnheader", { name: heading })).toBeVisible();
  }
  await expect(table.getByText("Customer", { exact: true })).toBeVisible();
  await expect(table.getByText("Queued", { exact: true })).toBeVisible();
  await expect(table.getByText("Unassigned", { exact: true })).toBeVisible();
  await expect(table).not.toContainText("Parked by");
  const opener = page.getByRole("button", { name: "Details: Retrieval Queue" });
  await opener.click();
  await expect(page.getByRole("dialog", { name: "Retrieval Queue" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();

  await switchLocation(page, LOCATION_B);
  await expect(page.getByRole("button", { name: "All", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  expect(fixture.count(queuePath(LOCATION_B.locationId))).toBe(0);
  await page.getByRole("button", { name: "Retrieval Queue", exact: true }).click();
  await expect.poll(() => fixture.count(queuePath(LOCATION_B.locationId))).toBe(1);
  await expect(page.getByRole("table").getByText("Staff", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("Customer", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table").getByText("Queued", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table")).not.toContainText("Parked by");
  expect(fixture.count(`${overview(LOCATION_A.locationId)}/sessions`)).toBe(0);
});
