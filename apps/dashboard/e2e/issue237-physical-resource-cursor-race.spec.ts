import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterPhysicalResources,
  openPhysicalResources,
  switchTopbarLocation,
} from "./support/keys-spots";

const at = "2026-09-29T03:00:00.000Z";
const keyPath = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/physical-resources/key-slots`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function key(code: string, id: string) {
  return {
    keySlotId: id,
    code,
    status: "ACTIVE" as const,
    createdAt: at,
    updatedAt: at,
  };
}

async function switchAndOpen(
  page: Parameters<typeof switchTopbarLocation>[0],
  locationName: string,
) {
  await switchTopbarLocation(page, locationName);
  await openPhysicalResources(page);
}

test("late page 2 cannot carry its cursor into B or revisited A", async ({
  page,
}) => {
  const page2Started = deferred();
  const releasePage2 = deferred();
  const aCursors: Array<string | null> = [];
  const bCursors: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === keyPath(LOCATION_A.locationId)) {
        aCursors.push(cursor);
        if (cursor !== null) {
          page2Started.resolve();
          await releasePage2.promise;
          return {
            body: {
              items: [key("A-PAGE-2", "66666666-6666-4666-8666-666666666666")],
              nextCursor: null,
            },
          };
        }
        return {
          body: {
            items: [key("A-PAGE-1", "11111111-1111-4111-8111-111111111111")],
            nextCursor: "cursor_A_12345678",
          },
        };
      }
      if (path === keyPath(LOCATION_B.locationId)) {
        bCursors.push(cursor);
        return {
          body: {
            items: [key("B-01", "33333333-3333-4333-8333-333333333333")],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await expect(page.getByText("A-PAGE-1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page2Started.promise;

  await switchAndOpen(page, LOCATION_B.name);
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  expect(bCursors.length).toBeGreaterThan(0);
  expect(bCursors.every((cursor) => cursor === null)).toBe(true);

  const beforeRevisit = aCursors.length;
  await switchAndOpen(page, LOCATION_A.name);
  await expect(page.getByText("A-PAGE-1", { exact: true })).toBeVisible();
  expect(aCursors.slice(beforeRevisit).length).toBeGreaterThan(0);
  expect(aCursors.slice(beforeRevisit).every((cursor) => cursor === null)).toBe(
    true,
  );

  releasePage2.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("A-PAGE-2", { exact: true })).toHaveCount(0);
  await expect(page.getByText("A-PAGE-1", { exact: true })).toBeVisible();
});
