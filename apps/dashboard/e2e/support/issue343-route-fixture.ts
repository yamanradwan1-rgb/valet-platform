import { expect, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  type FixtureReply,
} from "./dashboard-api-fixture";
import { operationsReadReply, taskItem } from "./operations-fixtures";
import { signInOnCurrentPage } from "./foundation-ui";

export const routeTask = "77777777-7777-4777-8777-777777777721";
export const routeTrackers = [
  "77777777-7777-4777-8777-777777777731",
  "77777777-7777-4777-8777-777777777732",
];
export const routeDiscovery = `/v1/staff/tasks/${routeTask}/route-history-recordings`;
export const samplePath = (id = routeTrackers[0]!) =>
  `/v1/staff/tracking-sessions/${id}/route-history`;
export function recordedSample(index: number) {
  return {
    capturedAt: new Date(Date.UTC(2026, 9, 31, 12, 0, index)).toISOString(),
    latitude: 31.95 + index * 0.000001,
    longitude: 35.91 + index * 0.000001,
  };
}
export function recordings(count = 1) {
  return {
    nextCursor: null,
    recordings: routeTrackers.slice(0, count).map((trackingSessionId, i) => ({
      trackingSessionId,
      startedAt: "2026-10-31T12:00:00.000Z",
      endedAt: "2026-10-31T12:10:00.000Z",
      assigneeMembershipId:
        i === 0 ? "55555555-5555-4555-8555-555555555556" : null,
    })),
  };
}
export async function openRouteTask(
  page: Page,
  options: {
    status?: "COMPLETED" | "IN_PROGRESS";
    type?: "PARKING" | "RETRIEVAL";
    override?: (path: string, url: URL) => FixtureReply | undefined;
  } = {},
) {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      const overridden = options.override?.(path, new URL(request.url()));
      if (overridden) return overridden;
      if (path.endsWith("/overview/tasks"))
        return {
          body: {
            items: [
              taskItem({
                taskId: routeTask,
                status: options.status ?? "COMPLETED",
                taskType: options.type ?? "PARKING",
              }),
            ],
            nextCursor: null,
          },
        };
      if (path === routeDiscovery) return { body: recordings() };
      if (path === samplePath())
        return {
          body: {
            samples: [recordedSample(0), recordedSample(1)],
            nextCursor: null,
          },
        };
      return operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await page.goto("/tasks");
  await page
    .getByRole("heading", { name: "Sign in", exact: true })
    .waitFor({ timeout: 30000 });
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  const details = page.getByRole("button", {
    name: `Details: ${options.type === "RETRIEVAL" ? "Retrieval" : "Parking"}`,
  });
  await details.click();
  await expect(page.getByTestId("task-route-history-section")).toBeVisible();
  return fixture;
}

export async function openRouteViewer(page: Page) {
  await page.getByRole("button", { name: "View Route", exact: true }).click();
  return page.getByRole("dialog", {
    name: "Recorded Route History",
    exact: true,
  });
}
