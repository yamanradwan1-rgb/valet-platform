import {
  chromium,
  expect,
  open,
  geometry,
  evidence,
} from "./browser-support.mjs";
import { writeFileSync } from "node:fs";

const browser = await chromium.launch({ headless: false });
const results = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => {
    window.geoRequests = [];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success, failure) {
          window.geoRequests.push({ success, failure });
        },
      },
    });
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  page.setDefaultTimeout(10000);
  await open(page, "locale=en&theme=light&scope=location&section=zones");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const button = page.getByRole("button", {
    name: "Use my current location",
    exact: true,
  });
  expect(await page.evaluate(() => window.geoRequests.length)).toBe(0);
  const stored = await page.evaluate(() =>
    localStorage.getItem("vaylet-321-studio-v1"),
  );
  await button.click();
  await expect(button).toBeDisabled();
  expect(await page.evaluate(() => window.geoRequests.length)).toBe(1);
  await page.evaluate(() =>
    window.geoRequests[0].success({
      coords: { latitude: 52.52, longitude: 13.405, accuracy: 15 },
    }),
  );
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    "52.52",
  );
  await expect(page.getByLabel("Longitude", { exact: true })).toHaveValue(
    "13.405",
  );
  await expect(page.getByLabel("Radius (meters)", { exact: true })).toHaveValue(
    "80",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("vaylet-321-studio-v1")),
  ).toBe(stored);
  await expect(page.locator(".ps-map-caption bdi")).toHaveText(
    "52.5200, 13.4050",
  );
  results.push({
    name: "Explicit click only; mock coordinates fill draft; radius and saved data unchanged",
    status: "PASS",
  });

  for (const [code, text] of [
    [1, "permission denied"],
    [3, "timed out"],
    [2, "unavailable"],
  ]) {
    await button.click();
    await page.evaluate(
      (code) => window.geoRequests.at(-1).failure({ code }),
      code,
    );
    await expect(
      page.locator('.ps-current-location [role="alert"]'),
    ).toContainText(text);
    await expect(button).toBeEnabled();
  }
  results.push({
    name: "Permission denial, timeout, unavailable and retry feedback",
    status: "PASS",
  });

  await button.click();
  await page.getByLabel("Latitude", { exact: true }).fill("30.5");
  await page.evaluate(() =>
    window.geoRequests
      .at(-1)
      .success({ coords: { latitude: 40, longitude: 40, accuracy: 10 } }),
  );
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    "30.5",
  );
  await button.click();
  await page
    .locator(".ps-zone-form")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  await page.evaluate(() =>
    window.geoRequests
      .at(-1)
      .success({ coords: { latitude: 41, longitude: 41, accuracy: 10 } }),
  );
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    "31.95",
  );
  results.push({
    name: "Late location result cannot overwrite manual edits or a cancelled draft",
    status: "PASS",
  });

  await page.evaluate(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    }),
  );
  await button.click();
  await expect(
    page.locator('.ps-current-location [role="alert"]'),
  ).toContainText("supported browser");
  results.push({
    name: "Unsupported browser fallback preserves manual coordinate entry",
    status: "PASS",
  });

  for (const locale of ["en", "ar"])
    for (const theme of ["light", "dark"])
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await open(
          page,
          `scope=location&section=zones&locale=${locale}&theme=${theme}`,
        );
        await page
          .getByRole("button", {
            name: locale === "ar" ? "إضافة منطقة" : "Add zone",
            exact: true,
          })
          .click();
        const locate = page.getByRole("button", {
          name:
            locale === "ar"
              ? "استخدام موقعي الحالي"
              : "Use my current location",
          exact: true,
        });
        await expect(locate).toBeVisible();
        await expect(page.getByRole("searchbox")).toHaveCount(0);
        expect((await geometry(page)).some((item) => item.overflow)).toBe(
          false,
        );
        const rect = await locate.boundingBox();
        expect(rect.x >= 0 && rect.x + rect.width <= width).toBe(true);
        results.push({
          locale,
          theme,
          width,
          name: "No search; location button visible and no overflow",
          status: "PASS",
        });
      }
  writeFileSync(
    `${evidence}/current-location-verification.json`,
    JSON.stringify({ coordinateSource: "mock only", checks: results }, null, 2),
  );
  console.log(
    `PASS ${results.length} current-location and search-removal checks`,
  );
} finally {
  await browser.close();
}
