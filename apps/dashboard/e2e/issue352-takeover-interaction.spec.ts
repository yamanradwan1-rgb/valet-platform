import {
  emergencyTakeoverRequestSchema,
  type EmergencyTakeoverRequest,
} from "@valet/contracts";
import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
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
    taskType: "RETRIEVAL",
    status: "IN_PROGRESS",
    valetSessionId: ISSUE352_IDS.session,
    currentAssigneeMembershipId: transferred
      ? ISSUE352_IDS.actorB
      : ISSUE352_IDS.actorA,
    assignee: {
      membershipId: transferred ? ISSUE352_IDS.actorB : ISSUE352_IDS.actorA,
      identity: transferred
        ? {
            firstName: "Nora",
            lastName: "Replacement",
            email: "nora.replacement@example.test",
          }
        : {
            firstName: "Sami",
            lastName: "Retriever",
            email: "sami@example.test",
          },
    },
  });
}

async function openAdminTask(
  page: Page,
  fixture: DashboardApiFixture,
  locale: "en" | "ar" = "en",
) {
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  if (locale === "ar")
    await page.getByRole("button", { name: "Language" }).click();
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(2);
  const opener = table.getByRole("row").nth(1).getByRole("button");
  await opener.click();
  return {
    opener,
    drawer: page.getByRole("dialog", {
      name: locale === "ar" ? "التفاصيل" : "Details",
    }),
  };
}

test("issue352 Company Admin submits exactly one scoped reasoned POST and reconciles receipt", async ({
  page,
}) => {
  const posts: EmergencyTakeoverRequest[] = [];
  let transferred = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
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
  const { drawer } = await openAdminTask(page, fixture);
  const action = drawer.getByTestId("emergency-takeover-open");
  await expect(action).toBeVisible();
  await action.click();
  const dialog = page.getByRole("dialog", { name: "Emergency Takeover" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("JO 12-34567")).toBeVisible();
  await expect(dialog.getByText("Sami Retriever")).toBeVisible();
  await expect(dialog.getByText("Front Desk")).toBeVisible();
  const confirm = dialog.getByTestId("emergency-takeover-confirm");
  await expect(confirm).toBeDisabled();
  await dialog
    .getByTestId("emergency-takeover-candidate")
    .selectOption(ISSUE352_IDS.actorB);
  const reason = dialog.getByTestId("emergency-takeover-reason");
  await reason.fill("😀".repeat(501));
  await expect(reason).toHaveValue("😀".repeat(500));
  await expect(dialog.getByRole("alert")).toContainText(
    "Maximum 500 Unicode characters",
  );
  await expect(confirm).toBeDisabled();
  await reason.fill("😀".repeat(499));
  await reason.fill("😀".repeat(500));
  await expect(dialog.getByText("500/500")).toBeVisible();
  await expect(confirm).toBeEnabled();
  await reason.fill("Unauthorized\ncontrol");
  await expect(reason).toHaveAttribute("aria-invalid", "true");
  await expect(confirm).toBeDisabled();
  await reason.fill("  Vehicle retrieval recovery  ");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect.poll(() => posts.length).toBe(1);
  expect(Object.keys(posts[0]!).sort()).toEqual([
    "expectedVersion",
    "operationId",
    "reason",
    "targetAssigneeMembershipId",
  ]);
  expect(posts[0]).toMatchObject({
    expectedVersion: 9,
    targetAssigneeMembershipId: ISSUE352_IDS.actorB,
    reason: "Vehicle retrieval recovery",
  });
  expect(posts[0]!.operationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  await expect(dialog.getByText(/Task ownership updated/u)).toBeVisible();
  await expect(dialog.getByTestId("emergency-takeover-confirm")).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("Nora Replacement");
  expect(fixture.count(issue352ContextPath)).toBeGreaterThanOrEqual(2);
  expect(fixture.count(issue352TakeoverPath)).toBe(1);
});

test("issue352 Arabic small-screen nested Cancel never posts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 768 });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === tasksPath)
        return { body: { items: [taskRow()], nextCursor: null } };
      if (path === issue352ContextPath)
        return { body: issue352TakeoverContext() };
      return undefined;
    },
  });
  await openAdminTask(page, fixture, "ar");
  const action = page.getByTestId("emergency-takeover-open");
  await expect(action).toHaveText("نقل طارئ");
  await action.click();
  const dialog = page.getByRole("dialog", { name: "نقل طارئ" });
  await expect(
    dialog.getByText("الموظف البديل", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByTestId("emergency-takeover-confirm")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(fixture.count(issue352TakeoverPath)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});

test("issue352 denied authoritative context yields no action or POST", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === tasksPath)
        return { body: { items: [taskRow()], nextCursor: null } };
      if (path === issue352ContextPath)
        return {
          status: 403,
          body: {
            code: "AUTHORIZATION_DENIED",
            message: "denied",
            requestId: "e2e-403",
          },
        };
      return undefined;
    },
  });
  const { drawer } = await openAdminTask(page, fixture);
  await expect
    .poll(() => fixture.count(issue352ContextPath))
    .toBeGreaterThan(0);
  await expect(drawer.getByTestId("emergency-takeover-open")).toHaveCount(0);
  expect(fixture.count(issue352TakeoverPath)).toBe(0);
});

test("issue352 late context cannot resurrect a closed Task Drawer", async ({
  page,
}) => {
  let releaseContext: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseContext = resolve;
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path === tasksPath)
        return { body: { items: [taskRow()], nextCursor: null } };
      if (path === issue352ContextPath) {
        await gate;
        return { body: issue352TakeoverContext() };
      }
      return undefined;
    },
  });
  const { opener, drawer } = await openAdminTask(page, fixture);
  await expect
    .poll(() => fixture.count(issue352ContextPath))
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  releaseContext();
  await expect(page.getByTestId("emergency-takeover-open")).toHaveCount(0);
  expect(fixture.count(issue352TakeoverPath)).toBe(0);
});
