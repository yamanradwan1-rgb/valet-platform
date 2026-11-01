import { open407Studio, draft407Zone } from "./support/issue407-studio-fixture";
import { expect, test } from "@playwright/test";
import { PresenceFixture, lmBase } from "./support/presence-fixtures";
import {
  installIssue407Map,
  map407State,
  replayRetired407Clicks,
} from "./support/issue407-map-sdk";
import { mockPresenceLocation } from "./support/presence-map-mock";

test("real Studio path uses the shared SDK, keeps saved geometry, explicit Save and canonical refresh", async ({
  page,
}) => {
  await installIssue407Map(page);
  const fixture = await open407Studio(page);
  await expect(
    page.getByText("Loading Google Maps", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".ps-offline-map, .ps-map-building")).toHaveCount(
    0,
  );
  await expect
    .poll(async () => (await map407State(page)).circles.length)
    .toBe(1);
  const saved = fixture.zones[0]!;
  expect((await map407State(page)).circles[0]).toMatchObject({
    center: { lat: saved.latitude, lng: saved.longitude },
    radius: saved.radiusMeters,
  });
  await page.getByRole("button", { name: "SDK test click (no tiles)" }).click();
  expect(fixture.writes).toEqual([]);
  await draft407Zone(page);
  await page.getByRole("button", { name: "SDK test click (no tiles)" }).click();
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue("40");
  await expect(page.getByLabel("Longitude", { exact: true })).toHaveValue(
    "-50",
  );
  await page.getByLabel("Radius (meters)", { exact: true }).fill("125.5");
  await expect
    .poll(async () => (await map407State(page)).circles.at(-1)?.radius)
    .toBe(125.5);
  expect((await map407State(page)).circles).toHaveLength(2);
  await page.getByLabel("Latitude", { exact: true }).fill("41");
  await expect
    .poll(async () => (await map407State(page)).circles.at(-1)?.center)
    .toEqual({ lat: 41, lng: -50 });
  expect(fixture.writes).toEqual([]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".ps-zone-form")).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    path: `${lmBase}/zones`,
    body: { latitude: 41, longitude: -50, radiusMeters: 125.5 },
  });
  await expect(page.locator(".ps-zone-list")).toContainText("New gate");
  await expect
    .poll(async () =>
      (await map407State(page)).titles.some((title) =>
        title.includes("New gate"),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator(".ps-zone-list")).toContainText("New gate");
  expect(fixture.writes).toHaveLength(1);
});

test("cancel retires clicks and geolocation without writing; denial keeps manual input usable", async ({
  page,
}) => {
  await installIssue407Map(page);
  await mockPresenceLocation(page);
  const fixture = await open407Studio(page);
  await draft407Zone(page);
  expect(await page.evaluate(() => window.presenceGeo.calls.length)).toBe(0);
  await page
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  expect(await page.evaluate(() => window.presenceGeo.calls.length)).toBe(1);
  await page.evaluate(() =>
    window.presenceGeo.error?.({ code: 1 } as GeolocationPositionError),
  );
  await expect(page.locator(".ps-current-location [role=alert]")).toBeVisible();
  await page.getByLabel("Latitude", { exact: true }).fill("10");
  await page.getByLabel("Longitude", { exact: true }).fill("20");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await draft407Zone(page);
  await replayRetired407Clicks(page);
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue("");
  expect(fixture.writes).toEqual([]);
});

test("provider failure retains the draft, removes overlays and offers keyboard Retry", async ({
  page,
}) => {
  await installIssue407Map(page);
  const fixture = await open407Studio(page);
  await draft407Zone(page);
  await page.getByLabel("Latitude", { exact: true }).fill("10");
  await page.getByLabel("Longitude", { exact: true }).fill("20");
  await page.evaluate(() =>
    (window as Window & { gm_authFailure?: () => void }).gm_authFailure?.(),
  );
  await expect(page.locator(".ps-map-feedback")).toContainText(
    "Google Maps could not load",
  );
  expect((await map407State(page)).circles).toEqual([]);
  await page.getByLabel("Latitude", { exact: true }).fill("11");
  await page.getByLabel("Radius (meters)", { exact: true }).fill("30");
  await page
    .locator(".ps-map-feedback")
    .getByRole("button", { name: "Retry" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ps-map-feedback")).toBeVisible();
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue("11");
  expect(fixture.writes).toEqual([]);
});

test("network SDK failure retries through the one shared loader without replacing the draft", async ({
  page,
}) => {
  await page.route("https://maps.googleapis.com/maps/api/js?**", (route) =>
    route.abort(),
  );
  const fixture = await open407Studio(page);
  await expect(page.locator(".ps-map-feedback")).toBeVisible();
  await draft407Zone(page);
  await page.getByLabel("Latitude", { exact: true }).fill("10");
  await page.getByLabel("Longitude", { exact: true }).fill("20");
  await installIssue407Map(page);
  await page
    .locator(".ps-map-feedback")
    .getByRole("button", { name: "Retry" })
    .click();
  await expect(page.locator(".ps-map-feedback")).toHaveCount(0);
  await expect
    .poll(async () => (await map407State(page)).circles.length)
    .toBe(2);
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue("10");
  expect(fixture.writes).toEqual([]);
});

test("Company Admin uses exact Location scope and empty zones never propose a center", async ({
  page,
}) => {
  await installIssue407Map(page);
  const fixture = new PresenceFixture("CA");
  fixture.zones = [];
  await open407Studio(page, fixture);
  await expect
    .poll(async () => (await map407State(page)).circles.length)
    .toBe(0);
  await expect(page.locator(".ps-zone-map")).toContainText(
    "no Location center is assumed",
  );
  await draft407Zone(page);
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue("");
  expect(fixture.writes).toEqual([]);
});
