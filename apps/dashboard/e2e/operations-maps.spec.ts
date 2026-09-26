import { expect, test } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { areaItem, liveMapBody, pointItem } from "./support/operations-fixtures";

const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

test("LM Maps renders truthful coordinates and map setup reconciles success, conflict, and lost response", async ({ page }) => {
  let points = [pointItem()];
  let areas = [areaItem()];
  let pointConflict = false;
  let pointPatchCount = 0;
  let areaPostCount = 0;
  let areaPatchCount = 0;
  let verticesPutCount = 0;
  let lastPointPatch: unknown = null;
  let lastAreaPatch: unknown = null;
  let lastVertices: unknown = null;
  const liveCursors: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === livePath) {
        const cursor = new URL(request.url()).searchParams.get("cursor");
        liveCursors.push(cursor);
        const body = liveMapBody();
        return { body: { ...body, nextCursor: cursor ? null : "live_cursor_12345678" } };
      }
      if (path === pointsPath && request.method() === "GET") return { body: { points } };
      if (path === pointsPath && request.method() === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        const created = pointItem({
          ...body,
          id: "77777777-7777-4777-8777-777777777720",
          createdAt: "2026-09-21T12:01:00.000Z",
          updatedAt: "2026-09-21T12:01:00.000Z",
        });
        points = [...points, created];
        return { body: created };
      }
      if (path.startsWith(`${pointsPath}/`) && request.method() === "PATCH") {
        pointPatchCount += 1;
        lastPointPatch = request.postDataJSON();
        if (pointConflict) {
          pointConflict = false;
          return { status: 409, body: { code: "MAP_SETUP_CONFLICT", message: "conflict", requestId: "e2e-409" } };
        }
        points = points.map((point) => point.id === pointItem().id
          ? { ...point, ...(request.postDataJSON() as object), updatedAt: "2026-09-21T12:02:00.000Z" }
          : point);
        return { body: points[0] };
      }
      if (path === areasPath && request.method() === "GET") return { body: { areas } };
      if (path === areasPath && request.method() === "POST") {
        areaPostCount += 1;
        const body = request.postDataJSON() as Record<string, unknown>;
        const vertices = (body.vertices as Array<{ latitude: number; longitude: number }>).map((vertex, position) => ({ ...vertex, position }));
        const created = areaItem({
          ...body,
          vertices,
          id: "77777777-7777-4777-8777-777777777721",
        });
        areas = [...areas, created];
        return { body: created };
      }
      if (path.startsWith(`${areasPath}/`) && !path.endsWith("/vertices") && request.method() === "PATCH") {
        areaPatchCount += 1;
        lastAreaPatch = request.postDataJSON();
        areas = areas.map((area) => area.id === areaItem().id
          ? { ...area, ...(request.postDataJSON() as object), updatedAt: "2026-09-21T12:03:00.000Z" }
          : area);
        return { body: areas[0] };
      }
      if (path.endsWith("/vertices") && request.method() === "PUT") {
        verticesPutCount += 1;
        lastVertices = request.postDataJSON();
        const body = request.postDataJSON() as { vertices: Array<{ latitude: number; longitude: number }> };
        areas = areas.map((area) => area.id === areaItem().id
          ? { ...area, vertices: body.vertices.map((vertex, position) => ({ ...vertex, position })) }
          : area);
        return { body: areas[0] };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const livePanel = page.getByRole("complementary", { name: "Live Operations" });
  await expect(livePanel.locator("bdi").first()).toHaveAttribute("dir", "ltr");
  await expect(livePanel.getByText("Live", { exact: true }).first()).toBeVisible();
  await expect(livePanel.getByText("Last known", { exact: true }).first()).toBeVisible();
  await expect(livePanel.getByText("No current position", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Observed at:/u)).toBeVisible();
  await expect(page.getByText(/Observed at:.*3:00/u)).toBeVisible();
  await expect(page.getByText("2026-09-21T12:00:00.000Z", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("coordinate-canvas")).toBeVisible();
  await expect(page.getByText(/not a floor plan or street map/u)).toBeVisible();
  await expect(page.getByText("Occupancy", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Capacity", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("coordinate-canvas").locator("svg circle")).toHaveCount(3);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => liveCursors).toContain("live_cursor_12345678");
  await page.getByRole("button", { name: "Previous", exact: true }).click();

  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
  await page.getByRole("button", { name: "Add Point" }).click();
  const addPoint = page.getByRole("dialog", { name: "Add Point" });
  await addPoint.getByText("Code", { exact: true }).locator("..").getByRole("textbox").fill("PICK");
  await addPoint.getByText("Label", { exact: true }).locator("..").getByRole("textbox").fill("Pickup");
  await addPoint.getByText("Latitude", { exact: true }).locator("..").getByRole("textbox").fill("31.955");
  await addPoint.getByText("Longitude", { exact: true }).locator("..").getByRole("textbox").fill("35.912");
  await addPoint.getByRole("combobox").selectOption("PICKUP");
  await addPoint.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Pickup", { exact: true })).toBeVisible();

  pointConflict = true;
  await page.getByRole("button", { name: /Entrance/u }).click();
  const editPoint = page.getByRole("dialog", { name: "Edit" });
  await editPoint.getByText("Label", { exact: true }).locator("..").getByRole("textbox").fill("Entrance Updated");
  await editPoint.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/changed on the server/u)).toBeVisible();
  expect(pointPatchCount).toBe(1);
  expect(lastPointPatch).toEqual({ label: "Entrance Updated" });
  await editPoint.getByRole("button", { name: "Cancel" }).click();

  let abortedWrites = 0;
  let abortNextPatch = true;
  await page.route(`**${pointsPath}/*`, async (route) => {
    if (route.request().method() === "PATCH" && abortNextPatch) {
      abortNextPatch = false;
      abortedWrites += 1;
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: /Entrance/u }).click();
  const lostPoint = page.getByRole("dialog", { name: "Edit" });
  await lostPoint.getByText("Label", { exact: true }).locator("..").getByRole("textbox").fill("Entrance Uncertain");
  await lostPoint.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/write outcome is uncertain/u)).toBeVisible();
  expect(abortedWrites).toBe(1);
  await lostPoint.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add Area" }).click();
  const addArea = page.getByRole("dialog", { name: "Add Area" });
  await addArea.getByText("Code", { exact: true }).locator("..").getByRole("textbox").fill("STG");
  await addArea.getByText("Label", { exact: true }).locator("..").getByRole("textbox").fill("Staging Area");
  await addArea.getByRole("combobox").selectOption("STAGING");
  await addArea.getByRole("textbox", { name: /Boundary points/u }).fill("31.950, 35.910\n31.951, 35.910\n31.951, 35.911");
  await addArea.getByRole("button", { name: "Save" }).click();
  expect(areaPostCount).toBe(1);
  await expect(page.getByText("Staging Area", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit: Parking Area", exact: true }).click();
  const editArea = page.getByRole("dialog", { name: "Edit" });
  await editArea.getByText("Label", { exact: true }).locator("..").getByRole("textbox").fill("Lot A");
  await editArea.getByRole("button", { name: "Save" }).click();
  expect(areaPatchCount).toBe(1);
  expect(lastAreaPatch).toEqual({ label: "Lot A" });

  await page.getByRole("button", { name: /Edit boundary/u }).first().click();
  const vertices = page.getByRole("dialog", { name: "Edit boundary" });
  await vertices.getByRole("textbox", { name: /Boundary points/u }).fill("31.952, 35.910\n31.953, 35.910\n31.953, 35.912");
  await vertices.getByRole("button", { name: "Save" }).click();
  expect(verticesPutCount).toBe(1);
  expect(lastVertices).toEqual({
    vertices: [
      { latitude: 31.952, longitude: 35.91 },
      { latitude: 31.953, longitude: 35.91 },
      { latitude: 31.953, longitude: 35.912 },
    ],
  });
});

test("coordinate view centers degenerate real-coordinate axes instead of inventing an edge position", async ({ page }) => {
  const oneItem = liveMapBody().items[0]!;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === livePath
      ? { body: { items: [oneItem], nextCursor: null, observedAt: "2026-09-21T12:00:00.000Z" } }
      : undefined,
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const marker = page.getByTestId("coordinate-canvas").locator("svg circle");
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute("cx", "50");
  await expect(marker).toHaveAttribute("cy", "50");
});
