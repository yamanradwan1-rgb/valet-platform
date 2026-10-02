import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  operationsReadReply,
  OP_IDS,
  retrievalItem,
  sessionItem,
} from "./support/operations-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

const base = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const assignee = {
  membershipId: E2E_IDS.membership,
  identity: {
    firstName: "Lina",
    lastName: "Haddad",
    email: "lina@example.com",
  },
};
const facts = sessionItem({
  activeTask: { taskId: OP_IDS.task, assignee },
  keySlot: { resourceId: OP_IDS.keySlot, code: "K-12", label: null },
  parkingSpot: { resourceId: OP_IDS.area, code: "P-4", label: "North" },
  parkingZone: { resourceId: OP_IDS.point, code: "Z-1", label: "Garage" },
  vehicle: {
    vehicleId: OP_IDS.vehicle,
    make: "Toyota",
    model: "Camry",
    color: "Black",
    plateCountry: "JO",
    plateNumberNormalized: "12-34567",
    temporaryDescriptor: null,
  },
});

test("#241 uses projected facts, server filters, scoped page resets and zero row reads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const queries: URLSearchParams[] = [];
  let latePageFinished = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path, request) => {
      if (path === `${base}/sessions`) {
        const query = new URL(request.url()).searchParams;
        queries.push(query);
        if (query.has("cursor")) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          latePageFinished = true;
          return {
            body: {
              items: [
                sessionItem({
                  vehicle: { ...(facts.vehicle as object), model: "Late page" },
                }),
              ],
              nextCursor: null,
            },
          };
        }
        const item =
          query.get("filter") === "CHECK_IN"
            ? { ...facts, state: "CHECKING_IN", activeTask: null }
            : facts;
        return { body: { items: [item], nextCursor: "abcdefgh" } };
      }
      if (path === `${base}/retrieval-queue`)
        return {
          body: {
            items: [
              {
                ...retrievalItem(),
                task: {
                  taskId: OP_IDS.task,
                  status: "ASSIGNED",
                  currentAssigneeMembershipId: E2E_IDS.membership,
                  assignee,
                },
              },
              { ...retrievalItem(), requestId: OP_IDS.incident, task: null },
            ],
            nextCursor: null,
          },
        };
      return operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  const table = page.getByRole("table");
  await expect(table.getByText("Toyota Camry", { exact: true })).toBeVisible();
  await expect(table.getByText("Lina Haddad", { exact: true })).toBeVisible();
  await expect(
    table.getByText("lina@example.com", { exact: true }),
  ).toBeVisible();
  expect(queries.map((query) => query.get("filter"))).toEqual(["ALL"]);
  expect(fixture.count(`${base}/session-state-counts`)).toBe(1);
  const before = await page.getByTestId("md03-page").boundingBox();
  await page.screenshot({
    path: "test-results/issue241-en-light.png",
    fullPage: true,
  });
  const details = page.getByRole("button", { name: "Details: Toyota Camry" });
  await details.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("K-12", { exact: true })).toBeVisible();
  await expect(drawer.getByText("P-4 · North", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Z-1 · Garage", { exact: true })).toBeVisible();
  await expect(drawer.getByText(OP_IDS.vehicle, { exact: true })).toHaveCount(
    0,
  );
  expect(fixture.count(`${base}/sessions`)).toBe(1);
  await page.screenshot({
    path: "test-results/issue241-drawer.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => queries.length).toBe(2);
  await page.getByRole("button", { name: "Check-in", exact: true }).click();
  await expect(table.getByText("Unassigned", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  expect(queries[2]!.get("filter")).toBe("CHECK_IN");
  expect(queries[2]!.has("cursor")).toBe(false);
  await expect.poll(() => latePageFinished).toBe(true);
  await expect(
    table.getByText("Toyota Late page", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Parked", exact: true }).click();
  await expect(table.getByText("Lina Haddad", { exact: true })).toBeVisible();
  await details.click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Check-in", exact: true }).click();
  await expect(table.getByText("Unassigned", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Parked", exact: true }).click();
  await expect(table.getByText("Lina Haddad", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(queries.slice(2).every((query) => !query.has("cursor"))).toBe(true);
  expect(fixture.count(`${base}/session-state-counts`)).toBe(1);
  expect(await page.getByTestId("md03-page").boundingBox()).toEqual(before);
  await page
    .getByRole("button", { name: "Retrieval Queue", exact: true })
    .click();
  await expect(table.getByText("Lina Haddad", { exact: true })).toBeVisible();
  await expect(table.getByText("Unassigned", { exact: true })).toBeVisible();
  expect(fixture.count(`${base}/retrieval-queue`)).toBe(1);
  expect(fixture.count(`${base}/sessions`)).toBe(6);
  expect(
    [...fixture.counts.keys()].filter((path) =>
      /employees|staff-directory|key-slots|parking-spots|parking-zones/.test(
        path,
      ),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(table.getByText("Lina Haddad", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/issue241-ar-dark-narrow.png",
    fullPage: true,
  });
});
