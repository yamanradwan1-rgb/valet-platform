import { expect, test, type Page } from "@playwright/test";
import { PresenceFixture, fillZone } from "./support/presence-fixtures";

declare global {
  interface Window {
    presenceGeo: {
      calls: PositionOptions[];
      success: PositionCallback | null;
      error: PositionErrorCallback | null;
    };
  }
}
async function mockLocation(page: Page) {
  await page.addInitScript(() => {
    window.presenceGeo = { calls: [], success: null, error: null };
    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      window.presenceGeo.calls.push(options ?? {});
      window.presenceGeo.success = success;
      window.presenceGeo.error = error ?? null;
    };
    navigator.geolocation.watchPosition = () => {
      throw new Error("Background tracking forbidden");
    };
  });
}
async function deliver(
  page: Page,
  latitude = 32,
  longitude = 36,
  accuracy = 999,
) {
  await page.evaluate(
    ({ latitude, longitude, accuracy }) => {
      window.presenceGeo.success?.({
        coords: {
          latitude,
          longitude,
          accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });
    },
    { latitude, longitude, accuracy },
  );
}

test("#266 is explicit one-shot and changes only center, never radius or saves", async ({
  page,
}) => {
  await mockLocation(page);
  const f = new PresenceFixture();
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  expect(await page.evaluate(() => window.presenceGeo.calls)).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Use my current location",
      exact: true,
    }),
  ).toBeDisabled();
  await deliver(page);
  await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
    "32",
  );
  await expect(dialog.getByLabel("Longitude", { exact: true })).toHaveValue(
    "36",
  );
  await expect(
    dialog.getByLabel("Radius (meters)", { exact: true }),
  ).toHaveValue("35.5");
  await expect(dialog).toContainText("Device accuracy (information only)");
  expect(f.writes).toHaveLength(0);
  expect(await page.evaluate(() => window.presenceGeo.calls)).toEqual([
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  ]);
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(storage)).not.toContain("latitude");
  expect(JSON.stringify(storage)).not.toContain("accuracy");
});

test("manual edits retire pending acquisition; late callback cannot overwrite center", async ({
  page,
}) => {
  await mockLocation(page);
  const f = new PresenceFixture();
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  await dialog.getByLabel("Latitude", { exact: true }).fill("31");
  await deliver(page);
  await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
    "31",
  );
  await expect(dialog.getByLabel("Longitude", { exact: true })).toHaveValue(
    "0",
  );
  expect(f.writes).toHaveLength(0);
});

test("cancel and reopen retires device callback and restores keyboard opener focus", async ({
  page,
}) => {
  await mockLocation(page);
  const f = new PresenceFixture();
  await f.open(page);
  const add = page.getByRole("button", { name: "Add zone", exact: true });
  await add.click();
  const dialog = await fillZone(page);
  await dialog
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await add.click();
  await deliver(page);
  await expect(
    page.getByRole("dialog").getByLabel("Latitude", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("dialog").getByLabel("Radius (meters)", { exact: true }),
  ).toHaveValue("");
  expect(f.writes).toHaveLength(0);
});

for (const [code, text] of [
  [1, "Location permission denied"],
  [2, "Current location unavailable"],
  [3, "Location request timed out"],
] as const) {
  test(`device failure ${code} leaves manual draft and Save usable`, async ({
    page,
  }) => {
    await mockLocation(page);
    const f = new PresenceFixture();
    await f.open(page);
    await page.getByRole("button", { name: "Add zone", exact: true }).click();
    const dialog = await fillZone(page);
    await dialog
      .getByRole("button", { name: "Use my current location", exact: true })
      .click();
    await page.evaluate(
      (code) =>
        window.presenceGeo.error?.({
          code,
          message: "private",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        }),
      code,
    );
    await expect(dialog).toContainText(text);
    await expect(
      dialog.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
      "0",
    );
    expect(f.writes).toHaveLength(0);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test("insecure geolocation and missing randomUUID keep manual creation available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { value: false });
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  const f = new PresenceFixture();
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Location requires a supported browser and secure connection.",
  );
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]!.body.zoneId).toMatch(
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
  );
});

test("backgrounding retires an outstanding foreground location proposal", async ({
  page,
}) => {
  await mockLocation(page);
  const f = new PresenceFixture();
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });
  await deliver(page);
  await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue("0");
  await expect(
    dialog.getByLabel("Radius (meters)", { exact: true }),
  ).toHaveValue("35.5");
  expect(f.writes).toHaveLength(0);
});
