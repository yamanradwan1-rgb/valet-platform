import { expect, test } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { areaItem, operationsReadReply, pointItem } from "./support/operations-fixtures";

const base = `/v1/staff/locations/${LOCATION_A.locationId}/map`;

test("issue380 rejects blank coordinates without changing valid numeric zero", async ({ page }) => {
  const requests: Array<{ method: string; body: Record<string, unknown> }> = [];
  const original = pointItem();
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === `${base}/points` && request.method() === "GET")
        return { body: { points: [original] } };
      if (path === `${base}/areas`) return { body: { areas: [areaItem()] } };
      if (path.startsWith(`${base}/points`) && ["POST", "PATCH"].includes(request.method())) {
        const body = request.postDataJSON() as Record<string, unknown>;
        requests.push({ method: request.method(), body });
        return { status: request.method() === "POST" ? 201 : 200, body: {
          ...original,
          ...(request.method() === "POST" ? body : {
            latitude: body.latitude, longitude: body.longitude,
          }),
          id: original.id, updatedAt: "2026-09-21T12:01:00.000Z",
        } };
      }
      return operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();

  const cases = [
    { code: "BLANK_LAT", latitude: "", longitude: "35.91", valid: false },
    { code: "SPACE_LON", latitude: "-31.5", longitude: "   ", valid: false },
    { code: "BOTH_BLANK", latitude: "", longitude: "", valid: false },
    { code: "REAL_ZERO", latitude: "0", longitude: "0", valid: true },
    { code: "NEGATIVE", latitude: "-31.5", longitude: "35.91", valid: true },
    { code: "OUT_OF_RANGE", latitude: "91", longitude: "0", valid: false },
  ];
  for (const entry of cases) {
    await page.getByRole("button", { name: "Add Point" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Point" });
    await dialog.getByLabel("Code").fill(entry.code);
    await dialog.getByLabel("Label").fill(entry.code);
    await dialog.getByLabel("Latitude").fill(entry.latitude);
    await dialog.getByLabel("Longitude").fill(entry.longitude);
    const before = requests.length;
    await dialog.getByRole("button", { name: "Save" }).click();
    if (entry.valid) {
      await expect(dialog).toHaveCount(0);
      expect(requests).toHaveLength(before + 1);
      expect(requests.at(-1)?.body).toMatchObject({
        latitude: Number(entry.latitude), longitude: Number(entry.longitude),
      });
    } else {
      await expect(dialog.getByRole("alert")).toBeVisible();
      expect(requests).toHaveLength(before);
      if (entry.code === "BLANK_LAT") {
        await test.info().attach("issue380-invalid-coordinate-form", {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toHaveCount(0);
    }
  }

  await page.getByRole("button", { name: "Edit: Entrance" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit" });
  await dialog.getByLabel("Latitude").fill("");
  await dialog.getByLabel("Longitude").fill(" ");
  const beforeUpdate = requests.length;
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(requests).toHaveLength(beforeUpdate);
  await dialog.getByLabel("Latitude").fill("0");
  await dialog.getByLabel("Longitude").fill("0");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toHaveLength(beforeUpdate + 1);
  expect(requests.at(-1)).toMatchObject({
    method: "PATCH", body: { latitude: 0, longitude: 0 },
  });
  await test.info().attach("issue380-coordinate-post-bodies", {
    body: JSON.stringify(requests),
    contentType: "application/json",
  });
});
