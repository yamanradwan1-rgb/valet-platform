import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { taskItem } from "./support/operations-fixtures";
import { enterR08, r08Path } from "./support/r08-accountability";

test("#341 Assigned To and Cancelled by remain separate in existing drawer", async ({
  page,
}, info) => {
  const item = {
    ...taskItem(),
    taskType: "RETRIEVAL",
    status: "CANCELLED",
    currentAssigneeMembershipId: E2E_IDS.membership,
    assignee: { membershipId: E2E_IDS.membership, identity: {
      firstName: "Synthetic", lastName: "Assignee", email: "synthetic@example.test",
    } },
    cancellation: {
      kind: "GUEST",
      displayName: null,
      occurredAt: "2026-10-25T09:00:00.000Z",
    },
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === r08Path("tasks")
        ? { body: { items: [item], nextCursor: null } }
        : undefined,
  });
  await enterR08(page, "/tasks", fixture);
  await page.locator("tbody tr").first().getByRole("button").click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Cancelled by");
  await expect(drawer).toContainText("Guest");
  await expect(drawer).toContainText("Assigned To");
  await page.screenshot({
    path: info.outputPath("task-cancelled.png"),
    fullPage: true,
  });
});
