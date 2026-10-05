import { expect, test } from "@playwright/test";
import { PresenceFixture, fillZone } from "./support/presence-fixtures";
import {
  mockPresenceMap,
  mockPresenceLocation,
  deliverPresenceLocation,
} from "./support/presence-map-mock";

for (const centerSource of ["Latitude", "Longitude", "map"] as const) {
  test(`#266 device accuracy retires after ${centerSource} replacement without autosave`, async ({
    page,
  }) => {
    await mockPresenceLocation(page);
    await mockPresenceMap(page);
    const f = new PresenceFixture();
    await f.open(page);
    await page.getByRole("button", { name: "Add zone", exact: true }).click();
    const dialog = await fillZone(page);
    await dialog
      .getByRole("button", { name: "Use my current location", exact: true })
      .click();
    await deliverPresenceLocation(page);
    await expect(dialog).toContainText("±12 m");
    await dialog.getByLabel("Radius (meters)", { exact: true }).fill("50");
    await expect(dialog).toContainText("±12 m");
    if (centerSource === "map")
      await dialog
        .getByRole("button", { name: "Mock geographic click", exact: true })
        .click();
    else await dialog.getByLabel(centerSource, { exact: true }).fill("30");
    await expect(dialog).not.toContainText("Device accuracy");
    await expect(
      dialog.getByLabel("Radius (meters)", { exact: true }),
    ).toHaveValue("50");
    expect(f.writes).toHaveLength(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add zone", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toContainText("Device accuracy");
    expect(f.writes).toHaveLength(0);
  });
}

test("manual center replacement clears stale device error and status", async ({
  page,
}) => {
  await mockPresenceLocation(page);
  const f = new PresenceFixture();
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  await page.evaluate(() =>
    window.presenceGeo.error?.({
      code: 1,
      message: "private",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }),
  );
  await expect(dialog).toContainText("Location permission denied");
  await dialog.getByLabel("Longitude", { exact: true }).fill("35");
  await expect(dialog).not.toContainText("Location permission denied");
  await expect(dialog).not.toContainText("Getting current location");
  expect(f.writes).toHaveLength(0);
});
