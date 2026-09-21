import { expect, test } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  incidentItem,
  keyItem,
  operationsReadReply,
  sessionItem,
  taskItem,
} from "./support/operations-fixtures";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;

test("MD-03 operational pages render only current authoritative projections with zero business writes", async ({ page }) => {
  const writes: string[] = [];
  const seenPaths: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      seenPaths.push(path);
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) {
        writes.push(`${request.method()} ${path}`);
      }
      if (path === `${overview}/sessions`) {
        return {
          body: {
            items: [sessionItem({
              vehicle: {
                vehicleId: "77777777-7777-4777-8777-777777777702",
                plateCountry: null,
                plateNumberNormalized: null,
                temporaryDescriptor: "Blue SUV near gate",
              },
            })],
            nextCursor: null,
          },
        };
      }
      return operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  await expect(page.getByText("Active Sessions")).toBeVisible();
  await expect(page.getByText("Requested Sessions")).toBeVisible();
  await expect(page.getByText("Retrieval Requested", { exact: true })).toHaveCount(0);
  await expect(page.getByText("In Transit")).toBeVisible();
  await expect(page.getByText("Handoff Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Today", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Blue SUV near gate")).toBeVisible();
  await expect(page.getByRole("tab", { name: /All \(/u })).toHaveAttribute("aria-selected", "true");
  for (const suffix of ["sessions", "session-state-counts", "retrieval-queue", "tasks"]) {
    await expect.poll(() => fixture.count(`${overview}/${suffix}`)).toBeGreaterThan(0);
  }

  await page.getByRole("tab", { name: "retrieval queue" }).click();
  await expect(page.getByText("OPEN", { exact: true })).toBeVisible();
  await expect(page.getByText("CUSTOMER", { exact: true })).toBeVisible();
  await expect(page.getByText("QUEUED", { exact: true })).toBeVisible();
  await expect(page.getByText("OPEN / ACCEPTED retrieval requests — loaded page only")).toBeVisible();
  await page.getByRole("tab", { name: "Tasks" }).click();
  await expect(page.getByText("PARKING", { exact: true })).toBeVisible();
  await expect(page.getByText("IN_PROGRESS", { exact: true })).toBeVisible();
  await expect(page.getByText("Parking / Retrieval tasks — loaded page only")).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await nav.getByRole("link", { name: "Vehicles" }).click();
  await expect(page.getByRole("heading", { name: "Vehicles", level: 1 })).toBeVisible();
  await expect(page.getByText("Blue SUV near gate")).toBeVisible();
  for (const forbidden of ["Registered Owner", "Add Vehicle", "Edit Vehicle", "Customer"]) {
    await expect(page.getByText(forbidden, { exact: true })).toHaveCount(0);
  }

  await nav.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("PARKING", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Unassigned", { exact: true }).first()).toBeVisible();
  for (const forbidden of ["MOVE", "SERVICE", "New Task", "Reassign", "Complete"]) {
    await expect(page.getByText(forbidden, { exact: true })).toHaveCount(0);
  }

  await nav.getByRole("link", { name: "Keys" }).click();
  await expect(page.getByText(keyItem().code, { exact: true })).toBeVisible();
  await expect(page.getByText("Empty slot", { exact: true })).toBeVisible();
  for (const forbidden of ["Add Key", "Checked out by", "Smart Key", "Return Key"]) {
    await expect(page.getByText(forbidden, { exact: true })).toHaveCount(0);
  }

  await nav.getByRole("link", { name: "Incidents" }).click();
  await expect(page.getByText(incidentItem().description)).toBeVisible();
  await expect(page.getByText("INVESTIGATING", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("OPEN / INVESTIGATING", { exact: true })).toBeVisible();
  for (const forbidden of ["Report Incident", "ClaimShield", "Insurance", "Export", "Resolve"]) {
    await expect(page.getByText(forbidden, { exact: true })).toHaveCount(0);
  }

  expect(writes).toEqual([]);
  expect(seenPaths.some((path) => path.includes("visit-contact"))).toBe(false);
  expect(seenPaths.some((path) => path.includes("/payment"))).toBe(false);
  expect(seenPaths.some((path) => path.includes("route-history"))).toBe(false);
  expect(seenPaths.some((path) => path.includes("/custody"))).toBe(false);
  expect(taskItem().taskType).toBe("PARKING");
});
