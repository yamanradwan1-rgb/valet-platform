import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { liveMapBody, sessionItem } from "./support/operations-fixtures";

test("Location A page-2 cursor never crosses into Location B and delayed A rows stay fenced", async ({ page }) => {
  const requests: Array<{ location: string; cursor: string | null }> = [];
  const pathA = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/sessions`;
  const pathB = `/v1/staff/dashboard/locations/${LOCATION_B.locationId}/overview/sessions`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) => {
      if (path !== pathA && path !== pathB) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      const location = path === pathA ? "A" : "B";
      requests.push({ location, cursor });
      if (path === pathA && cursor) {
        return {
          body: {
            items: [sessionItem({
              sessionId: "77777777-7777-4777-8777-777777777731",
              vehicle: {
                vehicleId: "77777777-7777-4777-8777-777777777732",
                plateCountry: null,
                plateNumberNormalized: null,
                temporaryDescriptor: "Delayed A vehicle",
              },
            })],
            nextCursor: null,
          },
          delayMs: 450,
        };
      }
      if (path === pathA) {
        return { body: { items: [sessionItem()], nextCursor: "cursor_A_12345678" } };
      }
      return {
        body: {
          items: [sessionItem({
            sessionId: "77777777-7777-4777-8777-777777777733",
            vehicle: {
              vehicleId: "77777777-7777-4777-8777-777777777734",
              plateCountry: null,
              plateNumberNormalized: null,
              temporaryDescriptor: "Location B vehicle",
            },
          })],
          nextCursor: null,
        },
      };
    },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => requests.some((request) =>
    request.location === "A" && request.cursor === "cursor_A_12345678",
  )).toBe(true);

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_B.name }).click();
  await expect(page.getByText("Location B vehicle")).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.getByText("Delayed A vehicle")).toHaveCount(0);
  expect(requests.some((request) => request.location === "B" && request.cursor !== null)).toBe(false);
});

test("stale live-map refresh from Location A cannot repaint Location B and there is no polling storm", async ({ page }) => {
  const liveA = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
  const liveB = `/v1/staff/locations/${LOCATION_B.locationId}/live-operations-map`;
  let liveACalls = 0;
  let liveBCalls = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) => {
      if (path === liveA) {
        liveACalls += 1;
        const base = liveMapBody();
        const body = {
          ...base,
          items: base.items.map((item) => ({
            ...item,
            vehicle: { ...item.vehicle, plateNumber: "A-LIVE" },
          })),
        };
        return { body, ...(liveACalls > 1 ? { delayMs: 450 } : {}) };
      }
      if (path === liveB) {
        liveBCalls += 1;
        const base = liveMapBody();
        return {
          body: {
            ...base,
            items: base.items.map((item) => ({
              ...item,
              vehicle: { ...item.vehicle, plateNumber: "B-LIVE" },
            })),
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText("A-LIVE").first()).toBeVisible();
  await page.waitForTimeout(150);
  const settledInitialCalls = liveACalls;
  expect(settledInitialCalls).toBeGreaterThanOrEqual(1);
  expect(settledInitialCalls).toBeLessThanOrEqual(2);
  await page.waitForTimeout(350);
  expect(liveACalls).toBe(settledInitialCalls);

  await page.getByRole("button", { name: "Refresh" }).first().click();
  await expect.poll(() => liveACalls).toBeGreaterThan(settledInitialCalls);
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_B.name }).click();
  await expect(page.getByText("B-LIVE").first()).toBeVisible();
  await page.waitForTimeout(150);
  const settledBCalls = liveBCalls;
  expect(settledBCalls).toBeGreaterThanOrEqual(1);
  expect(settledBCalls).toBeLessThanOrEqual(2);
  await page.waitForTimeout(550);
  await expect(page.getByText("A-LIVE")).toHaveCount(0);
  expect(liveBCalls).toBe(settledBCalls);
});
