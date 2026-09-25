import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { OP_IDS, sessionItem, taskItem } from "./support/operations-fixtures";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const sessionsPath = `${overview}/sessions`;
const tasksPath = `${overview}/tasks`;

function vehicleRows() {
  return [
    sessionItem({ state: "PARKED" }),
    sessionItem({
      sessionId: "77777777-7777-4777-8777-777777777711",
      state: "REQUESTED",
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
      keySlotId: null,
      currentAssigneeMembershipId: null,
      vehicle: {
        vehicleId: "77777777-7777-4777-8777-777777777714",
        plateCountry: null,
        plateNumberNormalized: null,
        temporaryDescriptor: null,
      },
    }),
  ];
}

function taskRows() {
  const statuses = [
    "QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED",
  ] as const;
  return statuses.map((status, index) => taskItem({
    taskId: `77777777-7777-4777-8777-77777777772${index}`,
    taskType: index % 2 === 0 ? "PARKING" : "RETRIEVAL",
    status,
    currentAssigneeMembershipId: index === 0 ? null : E2E_IDS.membership,
  }));
}

async function enterExactLocation(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

test("R04 Vehicles is manager-facing, truthful, cursor-safe, and keeps IDs in details", async ({ page }) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) {
        writes.push(`${request.method()} ${path}`);
      }
      if (path === sessionsPath) return { body: { items: vehicleRows(), nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await enterExactLocation(page);

  const table = page.getByRole("table");
  for (const header of ["Vehicle", "State", "Location", "Updated", "Actions"]) {
    await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect(table.getByText("12-34567", { exact: true })).toBeVisible();
  await expect(table.getByText("Blue SUV near gate", { exact: true })).toBeVisible();
  await expect(table.getByText("Plate unavailable", { exact: true })).toBeVisible();
  await expect(table.getByText("Parked", { exact: true })).toBeVisible();
  await expect(table.getByText("Retrieval Requested", { exact: true })).toBeVisible();
  await expect(table.getByText(LOCATION_A.name, { exact: true }).first()).toBeVisible();
  await expect(table.getByText(LOCATION_A.code, { exact: true }).first()).toBeVisible();
  await expect(table.getByText(/Sep 21.*3:00 PM/u).first()).toBeVisible();
  await expect(page.getByText("2026-09-21T12:00:00.000Z", { exact: true })).toHaveCount(0);
  for (const rawId of [OP_IDS.session, OP_IDS.vehicle, OP_IDS.keySlot, E2E_IDS.membership]) {
    await expect(table.getByText(rawId, { exact: true })).toHaveCount(0);
  }
  for (const fiction of ["Add Vehicle", "Edit Vehicle", "Registered Owner", "Customer", "Make / Model", "Type"]) {
    await expect(page.getByText(fiction, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("Search and filters apply to the loaded page only")).toBeVisible();

  const beforeFilter = fixture.count(sessionsPath);
  await page.getByRole("searchbox").fill("Blue SUV");
  await expect(table.getByText("Blue SUV near gate", { exact: true })).toBeVisible();
  await expect(table.getByText("12-34567", { exact: true })).toHaveCount(0);
  expect(fixture.count(sessionsPath)).toBe(beforeFilter);
  await page.getByRole("searchbox").fill("");

  const opener = page.getByRole("button", { name: "Details: 12-34567" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Details" });
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(dialog.getByText(OP_IDS.session, { exact: true })).toBeVisible();
  await expect(dialog.getByText(OP_IDS.vehicle, { exact: true })).toBeVisible();
  await expect(dialog.getByText(OP_IDS.keySlot, { exact: true })).toBeVisible();
  await expect(dialog.getByText(E2E_IDS.membership, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(writes).toEqual([]);
  expect(fixture.count(tasksPath)).toBe(0);
});

test("R04 Tasks exposes only canonical type/status and truthful assignment", async ({ page }) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) {
        writes.push(`${request.method()} ${path}`);
      }
      if (path === tasksPath) return { body: { items: taskRows(), nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page);
  await enterExactLocation(page);

  const table = page.getByRole("table");
  for (const header of ["Type", "Assigned To", "Location", "State", "Created", "Actions"]) {
    await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect(table.getByText("Parking", { exact: true }).first()).toBeVisible();
  await expect(table.getByText("Retrieval", { exact: true }).first()).toBeVisible();
  await expect(table.getByText("Assigned", { exact: true }).first()).toBeVisible();
  await expect(table.getByText("Unassigned", { exact: true })).toBeVisible();
  for (const label of ["Queued", "Assigned", "Accepted", "In Progress", "Completed", "Cancelled"]) {
    await expect(table.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(table.getByText(LOCATION_A.name, { exact: true }).first()).toBeVisible();
  await expect(table.getByText(/Sep 21.*1:30 PM/u).first()).toBeVisible();
  await expect(page.getByText("2026-09-21T10:30:00.000Z", { exact: true })).toHaveCount(0);
  for (const rawId of [OP_IDS.task, OP_IDS.session, E2E_IDS.membership]) {
    await expect(table.getByText(rawId, { exact: true })).toHaveCount(0);
  }
  for (const fiction of ["MOVE", "SERVICE", "KEYS", "INSPECTION", "DETAILING", "DELIVERY", "New Task", "Reassign", "Complete"]) {
    await expect(page.getByText(fiction, { exact: true })).toHaveCount(0);
  }

  const beforeFilter = fixture.count(tasksPath);
  await page.getByRole("combobox", { name: "Type" }).selectOption("RETRIEVAL");
  await expect(table.getByText("Retrieval", { exact: true })).toHaveCount(3);
  await expect(table.getByText("Parking", { exact: true })).toHaveCount(0);
  expect(fixture.count(tasksPath)).toBe(beforeFilter);
  await page.getByRole("combobox", { name: "Type" }).selectOption("ALL");

  const opener = page.getByRole("button", { name: "Details: Parking" }).first();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Details" });
  await expect(dialog.getByText(taskRows()[0]!.taskId, { exact: true })).toBeVisible();
  await expect(dialog.getByText(OP_IDS.session, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  expect(writes).toEqual([]);
  expect(fixture.count(sessionsPath)).toBe(0);
});

test("R04 Vehicles and Tasks localize manager labels and preserve RTL-safe values", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === sessionsPath) return { body: { items: [vehicleRows()[1]], nextCursor: null } };
      if (path === tasksPath) return { body: { items: [taskRows()[3]], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await enterExactLocation(page);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "المركبات", level: 1 })).toBeVisible();
  await expect(page.getByRole("table").getByText("تم طلب الاسترجاع", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").locator('bdi[dir="ltr"]').filter({ hasText: "Blue SUV near gate" })).toBeVisible();

  await page.getByRole("link", { name: "المهام" }).click();
  const taskTable = page.getByRole("table");
  await expect(taskTable.getByText("استرجاع", { exact: true })).toBeVisible();
  await expect(taskTable.getByText("قيد التنفيذ", { exact: true })).toBeVisible();
  await expect(taskTable.getByText("مسندة", { exact: true })).toBeVisible();
  await expect(taskTable.locator('bdi[dir="rtl"]').first()).toBeVisible();
});
