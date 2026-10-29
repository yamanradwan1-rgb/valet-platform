import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const countsPath = `${overview}/session-state-counts`;
const livePath = `${overview}/live-sessions`;
const sessionId = "77777777-7777-4777-8777-777777777754";
const commandPath = `/v1/staff/valet-sessions/${sessionId}/confirm-parked`;

function responseCounts(state) {
  return { counts: stateCounts().counts.map((item) => item.state === "PARKING"
    ? { ...item, count: state === "PARKING" ? 1 : 0 }
    : item) };
}

function responseRow(state) {
  return sessionItem({
    sessionId,
    state,
    checkedInBy: null,
    parkedBy: null,
    parkingCompletionProof: "NO_RECORD",
  });
}

test("focus-only return refreshes KPI once and repeated focus has no amplification", async ({ page, context }) => {
  let state = "PARKING";
  const trace = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === countsPath) {
        trace.push(`dashboard:GET counts -> ${state}`);
        return { body: responseCounts(state) };
      }
      if (path === livePath) {
        trace.push(`dashboard:GET live -> ${state}`);
        return { body: { items: [responseRow(state)], nextCursor: null } };
      }
      if (path === commandPath) {
        expect(request.method()).toBe("POST");
        state = "PARKED";
        trace.push("employee:POST confirm-parked -> PARKED");
        return { body: { sessionId, state } };
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
  expect(fixture.count(countsPath)).toBe(1);

  // A desktop-window focus change need not change document visibility.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("blur"));
  });
  const employee = await context.newPage();
  await fixture.install(employee);
  await employee.goto("/");
  await employee.evaluate(async (path) => {
    const response = await fetch(path, { method: "POST", headers: {
      "Content-Type": "application/json",
    }, body: JSON.stringify({
      expectedSessionVersion: 1, expectedTaskVersion: 1, keySlotCode: "K-12", parkingZoneCode: "P1",
    }) });
    if (!response.ok) throw new Error(`Employee fixture failed: ${response.status}`);
  }, commandPath);
  await employee.close();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  console.log(`ISSUE354_FOCUS_READS=${JSON.stringify(trace)}`);
  console.log(`ISSUE354_FOCUS_COUNT_REQUESTS=${fixture.count(countsPath)}`);
  await expect(transit.getByText("1", { exact: true })).toBeVisible();
  const afterFocus = fixture.count(countsPath);
  expect(afterFocus).toBeGreaterThan(1);
  expect(afterFocus).toBeLessThanOrEqual(3);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(350);
  expect(fixture.count(countsPath)).toBe(afterFocus);

  // One visibility-resume plus focus must not turn into two reads.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(() => fixture.count(countsPath)).toBe(afterFocus + 1);
  await page.waitForTimeout(350);
  expect(fixture.count(countsPath)).toBe(afterFocus + 1);
});
