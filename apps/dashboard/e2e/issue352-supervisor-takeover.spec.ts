import {
  emergencyTakeoverRequestSchema,
  type EmergencyTakeoverRequest,
} from "@valet/contracts";
import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import {
  openLocationManagerWorkspace,
  signInOnCurrentPage,
} from "./support/foundation-ui";
import {
  ISSUE352_IDS,
  issue352ContextPath,
  issue352TakeoverContext,
  issue352TakeoverPath,
  issue352TakeoverReceipt,
} from "./support/issue352-takeover-fixtures";
import { taskItem } from "./support/operations-fixtures";

const tasksPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/tasks`;

function taskRow(transferred = false) {
  return taskItem({
    taskId: ISSUE352_IDS.task,
    valetSessionId: ISSUE352_IDS.session,
    taskType: "RETRIEVAL",
    status: "IN_PROGRESS",
    currentAssigneeMembershipId: transferred
      ? ISSUE352_IDS.actorB
      : ISSUE352_IDS.actorA,
    assignee: {
      membershipId: transferred ? ISSUE352_IDS.actorB : ISSUE352_IDS.actorA,
      identity: transferred
        ? {
            firstName: "Nora",
            lastName: "Replacement",
            email: "nora@example.test",
          }
        : {
            firstName: "Sami",
            lastName: "Retriever",
            email: "sami@example.test",
          },
    },
  });
}

async function enterSupervisor(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page
    .getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` })
    .click();
  await expect(
    page.getByRole("heading", { name: "Maps & Zones" }),
  ).toBeVisible();
}

test("issue352 Supervisor exact active Shift reaches Tasks, details and reasoned takeover", async ({
  page,
}) => {
  const posts: EmergencyTakeoverRequest[] = [];
  let transferred = false;
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path, request) => {
      if (path === tasksPath)
        return { body: { items: [taskRow(transferred)], nextCursor: null } };
      if (path === issue352ContextPath)
        return { body: issue352TakeoverContext(transferred) };
      if (path === issue352TakeoverPath && request.method() === "POST") {
        const body = emergencyTakeoverRequestSchema.parse(
          request.postDataJSON(),
        );
        posts.push(body);
        transferred = true;
        return { body: issue352TakeoverReceipt(body) };
      }
      return undefined;
    },
  });
  await enterSupervisor(page, fixture);
  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await expect(nav.getByRole("link", { name: "Tasks" })).toBeVisible();
  for (const forbidden of [
    "Vehicles",
    "Administration",
    "Analytics",
    "Reports",
  ]) {
    await expect(nav.getByRole("link", { name: forbidden })).toHaveCount(0);
  }
  await nav.getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/tasks$/u);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect.poll(() => fixture.count(tasksPath)).toBeGreaterThan(0);
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Sami Retriever");
  const opener = table.getByRole("row").nth(1).getByRole("button");
  await opener.click();
  const drawer = page.getByRole("dialog", { name: "Details" });
  const action = drawer.getByTestId("emergency-takeover-open");
  await expect(action).toBeVisible();
  await action.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Emergency Takeover" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(action).toBeFocused();
  await action.click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByTestId("emergency-takeover-candidate")
    .selectOption(ISSUE352_IDS.actorB);
  await dialog
    .getByTestId("emergency-takeover-reason")
    .fill("Emergency shift recovery");
  const confirm = dialog.getByTestId("emergency-takeover-confirm");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    expectedVersion: 9,
    targetAssigneeMembershipId: ISSUE352_IDS.actorB,
    reason: "Emergency shift recovery",
  });
  expect(Object.keys(posts[0]!).sort()).toEqual([
    "expectedVersion",
    "operationId",
    "reason",
    "targetAssigneeMembershipId",
  ]);
  await expect(table).toContainText("Nora Replacement");
  expect(fixture.count(issue352TakeoverPath)).toBe(1);
});

test("issue352 Supervisor with no active Shift cannot enter Tasks", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [{ ...supervisorContext(), activeShift: null }],
  });
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await expect(
    page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Tasks" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tasks" })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  expect(fixture.count(tasksPath)).toBe(0);
  expect(fixture.count(issue352TakeoverPath)).toBe(0);
});

test("issue352 Supervisor shift at another Location is not a Tasks workspace", async ({
  page,
}) => {
  const original = supervisorContext();
  const elsewhere = {
    ...original,
    currentLocation: LOCATION_B,
    eligibleLocations: [LOCATION_B],
  };
  const fixture = new DashboardApiFixture({ operationalContexts: [elsewhere] });
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await expect(
    page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Tasks" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tasks" })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  expect(fixture.count(tasksPath)).toBe(0);
  expect(fixture.count(issue352TakeoverPath)).toBe(0);
});

test("issue352 revoked Supervisor context cannot expose Tasks or POST", async ({
  page,
}) => {
  let revoked = false;
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path) => {
      if (path === "/v1/staff/operational-context" && revoked)
        return { body: { contexts: [] } };
      if (path === tasksPath)
        return revoked
          ? {
              status: 403,
              body: {
                code: "AUTHORIZATION_DENIED",
                message: "denied",
                requestId: "revoked-task",
              },
            }
          : { body: { items: [taskRow()], nextCursor: null } };
      if (path === issue352ContextPath)
        return {
          status: 403,
          body: {
            code: "AUTHORIZATION_DENIED",
            message: "denied",
            requestId: "revoked-context",
          },
        };
      return undefined;
    },
  });
  await enterSupervisor(page, fixture);
  revoked = true;
  await page.goto("/tasks");
  await expect(page.getByText("Sami Retriever")).toHaveCount(0);
  await expect(page.getByTestId("emergency-takeover-open")).toHaveCount(0);
  expect(fixture.count(issue352TakeoverPath)).toBe(0);
});

test("issue352 Location Manager Tasks access does not gain emergency takeover", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === tasksPath
        ? { body: { items: [taskRow()], nextCursor: null } }
        : undefined,
  });
  await fixture.install(page);
  await openLocationManagerWorkspace(page);
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("table")).toContainText("Sami Retriever");
  await page
    .getByRole("table")
    .getByRole("row")
    .nth(1)
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog", { name: "Details" })).toBeVisible();
  await expect(page.getByTestId("emergency-takeover-open")).toHaveCount(0);
  expect(fixture.count(issue352TakeoverPath)).toBe(0);
});
