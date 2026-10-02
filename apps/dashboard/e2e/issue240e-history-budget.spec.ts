import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterHistory,
  historyPath,
  historyRow,
} from "./support/issue240e-history";
const path = historyPath();
test("history owns entry/pages/filters/detail; one local clock makes zero requests", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-02T06:00:00Z") });
  await page.addInitScript(() => {
    const original = window.setInterval;
    const clear = window.clearInterval;
    const ids = new Set<number>();
    const state = window as typeof window & { historyTimers: Set<number> };
    state.historyTimers = ids;
    window.setInterval = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => {
      const id = original(handler, timeout, ...args);
      if (timeout === 60_000) ids.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = (id) => {
      if (id !== undefined) ids.delete(id);
      clear(id);
    };
  });
  const active = historyRow();
  const ended = historyRow({
    shiftId: "60000000-0000-4000-8000-000000000002",
    status: "ENDED",
    endedAt: "2026-10-02T07:00:00.000Z",
  });
  const queries: URLSearchParams[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (route, request) => {
      if (route === path) {
        const q = new URL(request.url()).searchParams;
        queries.push(q);
        return {
          body: {
            items: q.has("status") ? [ended] : [active, ended],
            nextCursor:
              q.has("cursor") || q.has("status") ? null : "PAGE_TWO_CURSOR",
          },
        };
      }
      if (route === path + "/employees")
        return {
          body: {
            items: [
              { membershipId: active.membershipId, identity: active.identity },
            ],
            nextCursor: null,
          },
        };
      if (route === path + "/" + active.shiftId)
        return { body: historyRow({ currentRole: "VALET_SUPERVISOR" }) };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterHistory(page);
  await expect(page.getByRole("table")).toContainText("Maya O’Connor");
  expect(fixture.count(path)).toBe(1);
  expect(fixture.count(path + "/employees")).toBe(0);
  await expect(page.getByTestId("shift-duration").first()).toHaveText("1h 0m");
  await expect(page.getByTestId("shift-duration").nth(1)).toHaveText("2h 0m");
  const button = page.getByRole("table").getByRole("button").first();
  await button.click();
  const drawer = page.getByRole("dialog", { name: "Shift details" });
  await expect(drawer).toContainText("Supervisor");
  expect(fixture.count(path + "/" + active.shiftId)).toBe(1);
  await page.clock.runFor(120_000);
  await expect(page.getByTestId("shift-duration").first()).toHaveText("1h 2m");
  await expect(page.getByTestId("shift-duration").nth(1)).toHaveText("2h 0m");
  await expect(drawer).toContainText("1h 2m");
  expect(fixture.count(path)).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { historyTimers: Set<number> }).historyTimers
          .size,
    ),
  ).toBe(1);
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  expect(fixture.count(path)).toBe(2);
  expect(queries[1]!.get("cursor")).toBe("PAGE_TWO_CURSOR");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  expect(fixture.count(path)).toBe(3);
  expect(queries[2]!.has("cursor")).toBe(false);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("ENDED");
  await expect(page.getByRole("table")).toContainText("Ended");
  expect(fixture.count(path)).toBe(4);
  expect(queries[3]!.get("status")).toBe("ENDED");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => fixture.count(path)).toBe(5);
  expect(queries[4]!.has("cursor")).toBe(false);
  expect(
    [...fixture.counts.keys()].filter((p) => p.endsWith("/active-shifts")),
  ).toEqual([]);
  expect(
    await page
      .getByTestId("shift-duration")
      .evaluateAll((nodes) =>
        nodes.some(
          (node) =>
            node.hasAttribute("aria-live") ||
            node.getAttribute("role") === "status",
        ),
      ),
  ).toBe(false);
});
test("bounded employee/location selection and invalid date range preserve server query budget", async ({
  page,
}) => {
  const row = historyRow();
  const queries: URLSearchParams[] = [];
  const candidates: URLSearchParams[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (route, request) => {
      const q = new URL(request.url()).searchParams;
      if (route === path) {
        queries.push(q);
        return { body: { items: [row], nextCursor: null } };
      }
      if (route === path + "/employees") {
        candidates.push(q);
        return {
          body: {
            items: [{ membershipId: row.membershipId, identity: row.identity }],
            nextCursor: q.has("cursor") ? null : "EMPLOYEE_NEXT_CURSOR",
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterHistory(page);
  await expect(page.getByRole("table")).toBeVisible();
  const employee = page.getByRole("combobox", {
    name: "Employee",
    exact: true,
  });
  await employee.focus();
  await expect(employee.getByRole("option", { name: /Maya/ })).toHaveCount(1);
  expect(fixture.count(path + "/employees")).toBe(1);
  await employee.selectOption("NEXT");
  await expect.poll(() => candidates.length).toBe(2);
  await expect(
    employee.getByRole("option", { name: "Previous", exact: true }),
  ).toHaveCount(1);
  await employee.selectOption("PREVIOUS");
  await expect.poll(() => candidates.length).toBe(3);
  await page
    .getByRole("searchbox", { name: "Search shift history employees" })
    .fill("Maya");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => candidates.length).toBe(4);
  expect(candidates[3]!.get("search")).toBe("Maya");
  await expect(employee.getByRole("option", { name: /Maya/ })).toHaveCount(1);
  await employee.selectOption(row.membershipId);
  await expect.poll(() => queries.length).toBe(2);
  expect(queries[1]!.get("membershipId")).toBe(row.membershipId);
  const location = page.getByRole("combobox", {
    name: "Location",
    exact: true,
  });
  const locationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
  const initial = fixture.count(locationsPath);
  await location.focus();
  await expect(
    location.getByRole("option", { name: /Main Garage/ }),
  ).toHaveCount(1);
  expect(fixture.count(locationsPath)).toBe(initial + 1);
  await location.selectOption(LOCATION_A.locationId);
  await expect.poll(() => queries.length).toBe(3);
  expect(queries[2]!.get("locationId")).toBe(LOCATION_A.locationId);
  expect(queries[2]!.has("membershipId")).toBe(false);
  await page.getByLabel("From (inclusive)", { exact: true }).fill("2026-10-02");
  await expect.poll(() => queries.length).toBe(4);
  expect(queries[3]!.get("from")).toBe("2026-10-01T21:00:00.000Z");
  await page.getByLabel("To (exclusive)", { exact: true }).fill("2026-10-02");
  await expect(page.locator("#shift-date-error")).toContainText(
    "end after the start",
  );
  await page.waitForLoadState("networkidle");
  expect(queries.length).toBe(4);
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByLabel("To (exclusive)", { exact: true }).fill("2026-10-03");
  await expect.poll(() => queries.length).toBe(5);
  expect(queries[4]!.get("to")).toBe("2026-10-02T21:00:00.000Z");
});
