import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { areaItem, liveMapBody, pointItem } from "./support/operations-fixtures";

const livePath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/live-operations-map`;
const pointsPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/points`;
const areasPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/areas`;
const zonesPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/parking-zones`;
const zoneAId = "88888888-8888-4888-8888-888888888881";
const zoneBId = "88888888-8888-4888-8888-888888888882";
const zoneOldId = "88888888-8888-4888-8888-888888888883";

async function openLmSetup(page: Page) {
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
}

test("MD231 LM sends loaded CAS tokens and edits a human bounded ParkingZone", async ({ page }) => {
  let point = pointItem();
  let area = areaItem({
    parkingZoneId: zoneOldId,
    parkingZone: {
      code: "Z-OLD",
      label: "Archive Zone",
      parkingZoneId: zoneOldId,
      status: "INACTIVE",
    },
  });
  let pointWrites = 0;
  let lastPointPatch: Record<string, unknown> | null = null;
  let lastAreaPatch: Record<string, unknown> | null = null;
  let lastBoundary: Record<string, unknown> | null = null;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === livePath(LOCATION_A.locationId)) return { body: liveMapBody() };
      if (path === pointsPath(LOCATION_A.locationId) && request.method() === "GET") {
        return { body: { points: [point] } };
      }
      if (path.startsWith(`${pointsPath(LOCATION_A.locationId)}/`) && request.method() === "PATCH") {
        pointWrites += 1;
        lastPointPatch = request.postDataJSON() as Record<string, unknown>;
        return {
          status: 409,
          body: { code: "MAP_SETUP_CONFLICT", message: "conflict", requestId: "md231-409" },
        };
      }
      if (path === areasPath(LOCATION_A.locationId) && request.method() === "GET") {
        return { body: { areas: [area] } };
      }
      if (path.startsWith(`${areasPath(LOCATION_A.locationId)}/`) &&
          !path.endsWith("/vertices") && request.method() === "PATCH") {
        lastAreaPatch = request.postDataJSON() as Record<string, unknown>;
        const { expectedUpdatedAt: _token, ...patch } = lastAreaPatch;
        area = {
          ...area,
          ...patch,
          parkingZone: {
            code: "Z-A",
            label: "Zone Alpha",
            parkingZoneId: zoneAId,
            status: "ACTIVE",
          },
          updatedAt: "2026-09-21T12:03:00.000Z",
        };
        return { body: area };
      }
      if (path.endsWith("/vertices") && request.method() === "PUT") {
        lastBoundary = request.postDataJSON() as Record<string, unknown>;
        const vertices = lastBoundary.vertices as Array<{ latitude: number; longitude: number }>;
        area = {
          ...area,
          updatedAt: "2026-09-21T12:04:00.000Z",
          vertices: vertices.map((vertex, position) => ({ ...vertex, position })),
        };
        return { body: area };
      }
      if (path === zonesPath(LOCATION_A.locationId)) {
        const cursor = new URL(request.url()).searchParams.get("cursor");
        return cursor === null
          ? {
              body: {
                items: [{ code: "Z-A", label: "Zone Alpha", parkingZoneId: zoneAId, status: "ACTIVE" }],
                nextCursor: "zone_page_2_12345678",
              },
            }
          : {
              body: {
                items: [{ code: "Z-B", label: "Zone Beta", parkingZoneId: zoneBId, status: "ACTIVE" }],
                nextCursor: null,
              },
            };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openLmSetup(page);

  await page.getByRole("button", { name: "Edit: Parking Area", exact: true }).click();
  const areaDialog = page.getByRole("dialog", { name: "Edit" });
  await areaDialog.getByText("Advanced configuration", { exact: true }).click();
  const zoneSelect = areaDialog.getByRole("combobox", { name: "Parking Zone" });
  await expect(zoneSelect.locator("option:checked")).toContainText("Archive Zone");
  await expect(areaDialog.getByText("Inactive", { exact: true })).toBeVisible();
  await areaDialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(zoneSelect.locator("option")).toHaveCount(3);
  await expect(zoneSelect.locator("option")).toContainText([
    "No Parking Zone", "Archive Zone", "Zone Beta",
  ]);
  await areaDialog.getByRole("button", { name: "Previous", exact: true }).click();
  await zoneSelect.selectOption(zoneAId);
  await areaDialog.getByRole("button", { name: "Save" }).click();
  expect(lastAreaPatch).toEqual({
    expectedUpdatedAt: "2026-09-21T12:00:00.000Z",
    parkingZoneId: zoneAId,
  });

  await page.getByRole("button", { name: /Edit boundary/u }).first().click();
  const boundary = page.getByRole("dialog", { name: "Edit boundary" });
  await boundary.getByRole("textbox", { name: /Boundary points/u })
    .fill("31.952, 35.910\n31.953, 35.910\n31.953, 35.912");
  await boundary.getByRole("button", { name: "Save" }).click();
  expect(lastBoundary).toMatchObject({
    expectedUpdatedAt: "2026-09-21T12:03:00.000Z",
  });

  await page.getByRole("button", { name: /Entrance/u }).click();
  const pointDialog = page.getByRole("dialog", { name: "Edit" });
  await pointDialog.getByText("Label", { exact: true }).locator("..").getByRole("textbox")
    .fill("Stale browser label");
  await pointDialog.getByRole("button", { name: "Save" }).click();
  await expect(pointDialog).toHaveCount(0);
  await expect(page.getByText(/changed on the server/u)).toBeVisible();
  expect(pointWrites).toBe(1);
  expect(lastPointPatch).toEqual({
    expectedUpdatedAt: point.updatedAt,
    label: "Stale browser label",
  });

  let abortedWrites = 0;
  await page.route(`**${pointsPath(LOCATION_A.locationId)}/*`, async (route) => {
    if (route.request().method() === "PATCH") {
      abortedWrites += 1;
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: /Entrance/u }).click();
  const uncertain = page.getByRole("dialog", { name: "Edit" });
  await uncertain.getByText("Label", { exact: true }).locator("..").getByRole("textbox")
    .fill("Uncertain browser label");
  await uncertain.getByRole("button", { name: "Save" }).click();
  await expect(uncertain).toHaveCount(0);
  await expect(page.getByText(/write outcome is uncertain/u)).toBeVisible();
  expect(abortedWrites).toBe(1);
  expect(pointWrites).toBe(1);
});

test("MD231 ParkingZone cursor resets when Location scope changes", async ({ page }) => {
  const seenB: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) => {
      if (path === livePath(LOCATION_A.locationId) || path === livePath(LOCATION_B.locationId)) {
        return { body: liveMapBody() };
      }
      if (path === pointsPath(LOCATION_A.locationId) || path === pointsPath(LOCATION_B.locationId)) {
        return { body: { points: [pointItem()] } };
      }
      if (path === areasPath(LOCATION_A.locationId) || path === areasPath(LOCATION_B.locationId)) {
        return { body: { areas: [areaItem()] } };
      }
      if (path === zonesPath(LOCATION_A.locationId)) {
        const cursor = new URL(request.url()).searchParams.get("cursor");
        return {
          body: {
            items: [{ code: "Z-A", label: "Zone Alpha", parkingZoneId: zoneAId, status: "ACTIVE" }],
            nextCursor: cursor === null ? "zone_A_page_2_12345678" : null,
          },
        };
      }
      if (path === zonesPath(LOCATION_B.locationId)) {
        seenB.push(new URL(request.url()).searchParams.get("cursor"));
        return { body: { items: [], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openLmSetup(page);
  await page.getByRole("button", { name: "Add Area" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Area" });
  await dialog.getByText("Advanced configuration", { exact: true }).click();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Previous", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_B.name }).click();
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
  await expect.poll(() => seenB.length).toBeGreaterThan(0);
  expect(seenB.every((cursor) => cursor === null)).toBe(true);
});

test("MD231 Supervisor Maps formats authoritative operational timezone", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path) =>
      path === livePath(LOCATION_A.locationId) ? { body: liveMapBody() } : undefined,
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }).click();
  await expect(page.getByText(/Observed at:.*3:00/u)).toBeVisible();
  await expect(page.getByText(/Time unavailable/u)).toHaveCount(0);
  expect(fixture.count(pointsPath(LOCATION_A.locationId))).toBe(0);
  expect(fixture.count(areasPath(LOCATION_A.locationId))).toBe(0);
});

test("MD231 ParkingZone editor preserves Dashboard visual and accessibility patterns", async ({ page }) => {
  const linked = areaItem({
    parkingZoneId: zoneOldId,
    parkingZone: {
      code: "Z-OLD",
      label: "Archive Zone",
      parkingZoneId: zoneOldId,
      status: "INACTIVE",
    },
  });
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === livePath(LOCATION_A.locationId)) return { body: liveMapBody() };
      if (path === pointsPath(LOCATION_A.locationId)) return { body: { points: [pointItem()] } };
      if (path === areasPath(LOCATION_A.locationId)) return { body: { areas: [linked] } };
      if (path === zonesPath(LOCATION_A.locationId)) {
        return {
          body: {
            items: [{ code: "Z-A", label: "Zone Alpha", parkingZoneId: zoneAId, status: "ACTIVE" }],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLmSetup(page);
  const openEditor = async (advanced: string, accessibleName: string) => {
    await page.getByRole("button", { name: /^(?:Edit|تعديل): Parking Area$/u }).click();
    const dialog = page.getByRole("dialog", { name: /Edit|تعديل/u });
    await dialog.getByText(advanced, { exact: true }).click();
    const select = dialog.getByRole("combobox", { name: accessibleName });
    await select.focus();
    await expect(select).toBeFocused();
    return { dialog, select };
  };

  let editor = await openEditor("Advanced configuration", "Parking Zone");
  await expect(editor.select.locator("option:checked")).toContainText("Archive Zone");
  await expect(editor.dialog.getByText("Inactive", { exact: true })).toBeVisible();
  await editor.dialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Dark" }).click();
  editor = await openEditor("Advanced configuration", "Parking Zone");
  await editor.dialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Language" }).click();
  editor = await openEditor("إعدادات متقدمة", "منطقة الاصطفاف");
  await expect(editor.dialog.getByText("غير نشط", { exact: true })).toBeVisible();
  await editor.dialog.getByRole("button", { name: "إغلاق" }).click();
  await page.getByRole("button", { name: "فاتح" }).click();
  editor = await openEditor("إعدادات متقدمة", "منطقة الاصطفاف");
  await expect(editor.dialog.getByText("غير نشط", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 480, height: 900 });
  const viewport = await page.locator("html").evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
});
