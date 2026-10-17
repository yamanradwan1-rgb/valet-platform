import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { taskItem } from "./support/operations-fixtures";

const tasksPath =
  `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/tasks`;

const parker = {
  membershipId: E2E_IDS.membership,
  identity: {
    firstName: "Nora",
    lastName: "Parker",
    email: "nora@example.test",
  },
};

const retriever = {
  membershipId: "55555555-5555-4555-8555-555555555556",
  identity: {
    firstName: "Sami",
    lastName: "Retriever",
    email: "sami@example.test",
  },
};

function taskRows() {
  return [
    taskItem({
      taskId: "77777777-7777-4777-8777-777777777701",
      status: "COMPLETED",
      currentAssigneeMembershipId: parker.membershipId,
      assignee: parker,
    }),
    taskItem({
      taskId: "77777777-7777-4777-8777-777777777702",
      taskType: "RETRIEVAL",
      status: "IN_PROGRESS",
      currentAssigneeMembershipId: retriever.membershipId,
      assignee: retriever,
    }),
    taskItem({
      taskId: "77777777-7777-4777-8777-777777777703",
      taskType: "RETRIEVAL",
      status: "QUEUED",
      currentAssigneeMembershipId: null,
      assignee: null,
    }),
    taskItem({
      taskId: "77777777-7777-4777-8777-777777777704",
      status: "CANCELLED",
      currentAssigneeMembershipId: parker.membershipId,
      assignee: null,
    }),
    taskItem({
      taskId: "77777777-7777-4777-8777-777777777705",
      status: "COMPLETED",
      currentAssigneeMembershipId: parker.membershipId,
      assignee: null,
    }),
  ];
}

test("#299 mounted Tasks table and drawer preserve authorized completed staff in EN/AR", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === tasksPath
      ? { body: { items: taskRows(), nextCursor: null } }
      : undefined,
  });
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(6);
  const rows = table.getByRole("row");
  const completed = rows.nth(1);
  const active = rows.nth(2);
  const queued = rows.nth(3);
  const cancelled = rows.nth(4);
  const unproven = rows.nth(5);

  await expect(completed).toContainText("Completed");
  await expect(completed.getByRole("cell").nth(1)).toContainText("Nora Parker");
  await expect(active.getByRole("cell").nth(1)).toContainText("Sami Retriever");
  await expect(queued.getByRole("cell").nth(1)).toHaveText("Unassigned");
  await expect(cancelled.getByRole("cell").nth(1)).toHaveText("Unassigned");
  await expect(unproven.getByRole("cell").nth(1)).toHaveText("Unassigned");
  await expect(table).not.toContainText(parker.membershipId);

  const opener = completed.getByRole("button", { name: "Details: Parking" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const englishDrawer = page.getByRole("dialog", { name: "Details" });
  await expect(englishDrawer.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(englishDrawer).toContainText("Nora Parker");
  await expect(englishDrawer).toContainText("nora@example.test");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();

  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(table.getByRole("columnheader", { name: "المسند إليه" })).toBeVisible();
  await expect(completed).toContainText("مكتملة");
  await expect(completed.getByRole("cell").nth(1)).toContainText("Nora Parker");
  await expect(queued.getByRole("cell").nth(1)).toHaveText("غير مسندة");
  await expect(cancelled.getByRole("cell").nth(1)).toHaveText("غير مسندة");
  await expect(unproven.getByRole("cell").nth(1)).toHaveText("غير مسندة");
  await completed.getByRole("button", { name: "التفاصيل: اصطفاف" }).click();
  const arabicDrawer = page.getByRole("dialog", { name: "التفاصيل" });
  await expect(arabicDrawer).toContainText("Nora Parker");
  await expect(arabicDrawer).toContainText("المسند إليه");
  await page.keyboard.press("Escape");
  await expect(arabicDrawer).toHaveCount(0);
  expect(fixture.count(tasksPath)).toBeGreaterThan(0);
});
