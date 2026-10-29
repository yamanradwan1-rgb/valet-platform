import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const countsPath = `${overview}/session-state-counts`;
const livePath = `${overview}/live-sessions`;
const queuePath = `${overview}/retrieval-queue`;
const sessionId = "77777777-7777-4777-8777-777777777754";
const commandPath = `/v1/staff/valet-sessions/${sessionId}/confirm-parked`;

function modeledCounts(state) {
  return {
    counts: stateCounts().counts.map((entry) => ({
      ...entry,
      count: entry.state === "PARKING"
        ? (state === "PARKING" ? 1 : 0)
        : entry.state === "PARKED"
          ? (state === "PARKING" ? 4 : 5)
          : entry.count,
    })),
  };
}

function modeledRow(state) {
  return sessionItem({
    sessionId,
    state,
    checkedInBy: { firstName: "Fixture", lastName: "Employee" },
    parkedBy: state === "PARKED"
      ? { firstName: "Fixture", lastName: "Employee" }
      : null,
    parkingCompletionProof: state === "PARKED" ? "PROVEN" : "NO_RECORD",
    activeTask: state === "PARKING"
      ? { taskId: "77777777-7777-4777-8777-777777777755", assignee: null }
      : null,
    vehicle: {
      ...sessionItem().vehicle,
      plateCountry: null,
      plateNumberNormalized: null,
      temporaryDescriptor: "Modeled employee vehicle",
    },
  });
}

test("two-actor Parking completion refreshes Live counts with filter, page and view reads", async ({ page, context }) => {
  let modeledState = "PARKING";
  const trace = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === commandPath) {
        expect(request.method()).toBe("POST");
        expect(modeledState).toBe("PARKING");
        modeledState = "PARKED";
        trace.push("employee:POST confirm-parked -> PARKED");
        return { body: { sessionId, state: modeledState } };
      }
      if (path === countsPath) {
        trace.push(`dashboard:GET counts -> ${modeledState}`);
        return { body: modeledCounts(modeledState) };
      }
      if (path === livePath) {
        const url = new URL(request.url());
        const filter = url.searchParams.get("filter");
        const cursor = url.searchParams.get("cursor") ?? "first";
        trace.push(`dashboard:GET live ${filter}/${cursor} -> ${modeledState}`);
        return {
          body: {
            items: filter === "PARKED" && modeledState !== "PARKED"
              ? [] : [modeledRow(modeledState)],
            nextCursor: cursor === "first" ? "page_two_12345678" : null,
          },
        };
      }
      if (path === queuePath) {
        trace.push(`dashboard:GET queue -> ${modeledState}`);
        return { body: { items: [], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  const transit = page.getByText("In Transit").locator("..");
  await expect(transit.getByText("2", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Modeled employee vehicle");
  expect(fixture.count(countsPath)).toBe(1);

  // Separate browser actor executes the existing employee command route against
  // one shared modeled server state. No production services or DB are touched.
  const employee = await context.newPage();
  await fixture.install(employee);
  await employee.goto("/");
  await employee.evaluate(async (path) => {
    const response = await fetch(path, { method: "POST", headers: {
      "Content-Type": "application/json",
    }, body: JSON.stringify({
      expectedSessionVersion: 1, expectedTaskVersion: 1, keySlotCode: "K-12", parkingZoneCode: "P1",
    }) });
    if (!response.ok) throw new Error(`Modeled employee command failed: ${response.status}`);
  }, commandPath);
  await employee.close();

  await page.getByRole("button", { name: "Parked", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Modeled employee vehicle");
  await expect(page.getByRole("table")).toContainText("Parked");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Modeled employee vehicle");
  await page.getByRole("button", { name: "Retrieval Queue" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  console.log(`ISSUE354_PHASE_A_READS=${JSON.stringify(trace)}`);
  console.log(`ISSUE354_PHASE_A_COUNT_REQUESTS=${fixture.count(countsPath)}`);
  await expect(transit.getByText("1", { exact: true })).toBeVisible();
  expect(fixture.count(countsPath)).toBeGreaterThan(1);
  expect(fixture.count(countsPath)).toBeLessThanOrEqual(5);
});
