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
const labelPath = (locationId: string, resourceId: string) =>
  `${keyPath(locationId)}/${resourceId}/label`;

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
  name: string,
) {
  await switchTopbarLocation(page, name);
  await openPhysicalResources(page);
}

test("A to B to A fences stale physical-resource success", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, _request, api) => {
      if (path === keyPath(LOCATION_A.locationId)) {
        return api.count(path) === 1
          ? {
              delayMs: 900,
              body: {
                items: [key("STALE-A", "11111111-1111-4111-8111-111111111111")],
                nextCursor: null,
              },
            }
          : {
              body: {
                items: [key("FRESH-A", "22222222-2222-4222-8222-222222222222")],
                nextCursor: null,
              },
            };
      }
      if (path === keyPath(LOCATION_B.locationId))
        return {
          body: {
            items: [key("B-01", "33333333-3333-4333-8333-333333333333")],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await switchAndOpen(page, LOCATION_B.name);
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await switchAndOpen(page, LOCATION_A.name);
  await expect(page.getByText("FRESH-A", { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("STALE-A", { exact: true })).toHaveCount(0);
});

test("A to B to A fences stale physical-resource failure", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, _request, api) => {
      if (path === keyPath(LOCATION_A.locationId)) {
        return api.count(path) === 1
          ? {
              delayMs: 900,
              status: 503,
              body: {
                code: "SERVICE_UNAVAILABLE",
                message: "stale failure",
                requestId: "stale-a",
              },
            }
          : {
              body: {
                items: [key("FRESH-A", "22222222-2222-4222-8222-222222222222")],
                nextCursor: null,
              },
            };
      }
      if (path === keyPath(LOCATION_B.locationId))
        return {
          body: {
            items: [key("B-01", "33333333-3333-4333-8333-333333333333")],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await switchAndOpen(page, LOCATION_B.name);
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await switchAndOpen(page, LOCATION_A.name);
  await expect(page.getByText("FRESH-A", { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(
    page.getByTestId("physical-resources-surface").getByRole("alert"),
  ).toHaveCount(0);
});

test("delayed create in A cannot repaint or refresh B", async ({ page }) => {
  let createdA = false;
  let posts = 0;
  const created = key("A-CREATED", "55555555-5555-4555-8555-555555555555");
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) => {
      if (
        path === keyPath(LOCATION_A.locationId) &&
        request.method() === "POST"
      ) {
        posts += 1;
        createdA = true;
        return { delayMs: 900, status: 201, body: created };
      }
      if (path === keyPath(LOCATION_A.locationId))
        return {
          body: { items: createdA ? [created] : [], nextCursor: null },
        };
      if (path === keyPath(LOCATION_B.locationId))
        return {
          body: {
            items: [key("B-01", "33333333-3333-4333-8333-333333333333")],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Code").fill("A-CREATED");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect.poll(() => posts).toBe(1);
  await dialog.press("Escape");
  await switchAndOpen(page, LOCATION_B.name);
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  const bReads = fixture.count(keyPath(LOCATION_B.locationId));
  await page.waitForTimeout(1000);
  expect(fixture.count(keyPath(LOCATION_B.locationId))).toBe(bReads);
  await expect(page.getByText("A-CREATED", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Physical resource label" }),
  ).toHaveCount(0);
  await switchAndOpen(page, LOCATION_A.name);
  await expect(page.getByText("A-CREATED", { exact: true })).toBeVisible();
});

test("delayed label read from A cannot appear in B", async ({ page }) => {
  const resourceId = "77777777-7777-4777-8777-777777777777";
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) => {
      if (path === keyPath(LOCATION_A.locationId))
        return {
          body: { items: [key("A-LABEL", resourceId)], nextCursor: null },
        };
      if (path === labelPath(LOCATION_A.locationId, resourceId))
        return {
          delayMs: 900,
          body: {
            resourceType: "KEY_SLOT",
            resourceId,
            code: "A-LABEL",
            version: "V2",
            qrPayload: `vaylet:v2:key-slot:${resourceId}:A-LABEL`,
            location: {
              locationId: LOCATION_A.locationId,
              name: LOCATION_A.name,
              code: LOCATION_A.code,
            },
          },
        };
      if (path === keyPath(LOCATION_B.locationId))
        return {
          body: {
            items: [key("B-01", "33333333-3333-4333-8333-333333333333")],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await page.getByRole("button", { name: "View label" }).click();
  const labelDialog = page.getByRole("dialog", {
    name: "Physical resource label",
  });
  await expect(labelDialog).toBeVisible();
  await labelDialog.press("Escape");
  await switchAndOpen(page, LOCATION_B.name);
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(
    page.getByRole("dialog", { name: "Physical resource label" }),
  ).toHaveCount(0);
  await expect(page.getByText("A-LABEL", { exact: true })).toHaveCount(0);
});
