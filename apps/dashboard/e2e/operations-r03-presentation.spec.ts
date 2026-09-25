import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  OP_IDS,
  retrievalItem,
  sessionItem,
  stateCounts,
} from "./support/operations-fixtures";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;

test("R03 presents exact-Location sessions as manager-facing read-only operations", async ({ page }) => {
  const writes: string[] = [];
  const items = [
    sessionItem({ state: "REQUESTED" }),
    sessionItem({
      sessionId: "77777777-7777-4777-8777-777777777711",
      state: "PARKING",
      currentAssigneeMembershipId: null,
      vehicle: {
        vehicleId: "77777777-7777-4777-8777-777777777712",
        plateCountry: null,
        plateNumberNormalized: null,
        temporaryDescriptor: "Blue SUV near gate",
      },
    }),
    sessionItem({
      sessionId: "77777777-7777-4777-8777-777777777713",
      state: "HANDOFF_PENDING",
      vehicle: {
        vehicleId: "77777777-7777-4777-8777-777777777714",
        plateCountry: null,
        plateNumberNormalized: null,
        temporaryDescriptor: null,
      },
    }),
  ];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) {
        writes.push(`${request.method()} ${path}`);
      }
      if (path === `${overview}/sessions`) {
        return { body: { items, nextCursor: null } };
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

  await expect(page.getByRole("heading", { name: "Live Operations", level: 1 })).toBeVisible();
  await expect(page.getByText("Real-time operational context")).toBeVisible();
  const metric = (label: string) => page.getByText(label, { exact: true }).first().locator("..");
  await expect(metric("Active Sessions").getByText("15", { exact: true })).toBeVisible();
  await expect(metric("Waiting Retrieval").getByText("3", { exact: true })).toBeVisible();
  await expect(metric("In Transit").getByText("2", { exact: true })).toBeVisible();
  await expect(metric("Handoff Pending").getByText("2", { exact: true })).toBeVisible();

  const table = page.getByRole("table");
  for (const header of ["Vehicle", "Assigned To", "Location", "State", "Updated", "Actions"]) {
    await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect(table.getByText("12-34567", { exact: true })).toBeVisible();
  await expect(table.getByText("Blue SUV near gate", { exact: true })).toBeVisible();
  await expect(table.getByText("Plate unavailable", { exact: true })).toBeVisible();
  await expect(table.getByText("Assigned", { exact: true }).first()).toBeVisible();
  await expect(table.getByText("Unassigned", { exact: true })).toBeVisible();
  await expect(table.getByText(LOCATION_A.name, { exact: true }).first()).toBeVisible();
  await expect(table.getByText(LOCATION_A.code, { exact: true }).first()).toBeVisible();
  await expect(table.getByText("Retrieval Requested", { exact: true })).toBeVisible();
  await expect(table.getByText(/Sep 21.*3:00 PM/u).first()).toBeVisible();
  await expect(page.getByText("2026-09-21T12:00:00.000Z", { exact: true })).toHaveCount(0);
  for (const rawId of [OP_IDS.session, OP_IDS.vehicle, E2E_IDS.membership]) {
    await expect(page.getByText(rawId, { exact: true })).toHaveCount(0);
  }

  await expect(page.getByText("Filters apply to loaded page only")).toBeVisible();
  await expect(page.getByRole("button", { name: /All \(/u })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retrieved", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Issues", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "In Transit", exact: true }).click();
  await expect(table.getByText("Blue SUV near gate", { exact: true })).toBeVisible();
  await expect(table.getByText("12-34567", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();

  const opener = page.getByRole("button", { name: "Details: 12-34567" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Details" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(dialog.getByText(OP_IDS.session, { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText(OP_IDS.vehicle, { exact: true })).toBeVisible();
  await expect(dialog.getByText(E2E_IDS.membership, { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  expect(fixture.count(`${overview}/sessions`)).toBeGreaterThan(0);
  expect(fixture.count(`${overview}/session-state-counts`)).toBeGreaterThan(0);
  expect(fixture.count(`${overview}/retrieval-queue`)).toBe(0);
  expect(fixture.count(`${overview}/tasks`)).toBe(0);
  expect(writes).toEqual([]);
  await expect(page.getByRole("button", { name: "New Check-in" })).toHaveCount(0);
});

test("R03 localizes state, filter, time, and identifier direction in Arabic RTL", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${overview}/sessions`) {
        return { body: { items: [sessionItem({ state: "HANDOFF_PENDING" })], nextCursor: null } };
      }
      if (path === `${overview}/session-state-counts`) return { body: stateCounts() };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Language" }).click();

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "العمليات المباشرة", level: 1 })).toBeVisible();
  await expect(page.getByText("بانتظار التسليم", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "الكل", exact: true })).toHaveAttribute("aria-pressed", "true");
  const table = page.getByRole("table");
  await expect(table.locator('bdi[dir="ltr"]').filter({ hasText: "12-34567" })).toBeVisible();
  await expect(table.locator('bdi[dir="ltr"]').filter({ hasText: LOCATION_A.code }).first()).toBeVisible();
  await expect(table.locator('bdi[dir="rtl"]').first()).toBeVisible();
  await expect(page.getByText("HANDOFF_PENDING", { exact: true })).toHaveCount(0);
});

test("R03 keeps the unique Retrieval Queue capability lazy and manager-facing", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${overview}/sessions`) {
        return { body: { items: [sessionItem()], nextCursor: null } };
      }
      if (path === `${overview}/session-state-counts`) {
        return { body: stateCounts() };
      }
      if (path === `${overview}/retrieval-queue`) {
        return { body: { items: [retrievalItem()], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  expect(fixture.count(`${overview}/retrieval-queue`)).toBe(0);
  expect(fixture.count(`${overview}/tasks`)).toBe(0);
  await page.getByRole("button", { name: "Retrieval Queue", exact: true }).click();
  await expect.poll(() => fixture.count(`${overview}/retrieval-queue`)).toBe(1);
  expect(fixture.count(`${overview}/tasks`)).toBe(0);

  const table = page.getByRole("table");
  for (const header of [
    "Requested",
    "Requester",
    "Request Status",
    "Task Status",
    "Assigned To",
    "Actions",
  ]) {
    await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect(table.getByText(/Sep 21.*2:30 PM/u)).toBeVisible();
  await expect(table.getByText("Customer", { exact: true })).toBeVisible();
  await expect(table.getByText("Open", { exact: true })).toBeVisible();
  await expect(table.getByText("Queued", { exact: true })).toBeVisible();
  await expect(table.getByText("Unassigned", { exact: true })).toBeVisible();
  for (const rawId of [OP_IDS.retrieval, OP_IDS.session, OP_IDS.task]) {
    await expect(page.getByText(rawId, { exact: true })).toHaveCount(0);
  }

  const opener = page.getByRole("button", {
    name: "Details: Retrieval Queue",
  });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Retrieval Queue" });
  await expect(dialog.getByText(OP_IDS.retrieval, { exact: true })).toBeVisible();
  await expect(dialog.getByText(OP_IDS.session, { exact: true })).toBeVisible();
  await expect(dialog.getByText(OP_IDS.task, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});
