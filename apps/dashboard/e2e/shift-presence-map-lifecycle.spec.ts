import { expect, test } from "@playwright/test";
import { PresenceFixture, fillZone } from "./support/presence-fixtures";
import { mockPresenceMap } from "./support/presence-map-mock";

for (const initial of ["light", "dark"] as const) {
  test(`map initializes ${initial}, rebuilds deliberately and retires old listeners`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("vaylet_dashboard_theme", theme),
      initial,
    );
    const languages = await mockPresenceMap(page);
    const f = new PresenceFixture();
    await f.open(page);
    await page.getByRole("button", { name: "Add zone", exact: true }).click();
    const dialog = await fillZone(page);
    await expect
      .poll(() => page.evaluate(() => window.presenceMapMock?.schemes))
      .toEqual([initial.toUpperCase()]);
    const next = initial === "light" ? "dark" : "light";
    await page.evaluate((theme) => {
      localStorage.setItem("vaylet_dashboard_theme", theme);
      window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
    }, next);
    await expect
      .poll(() => page.evaluate(() => window.presenceMapMock.schemes))
      .toEqual([initial.toUpperCase(), next.toUpperCase()]);
    await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
      "0",
    );
    await expect(dialog.getByLabel("Longitude", { exact: true })).toHaveValue(
      "0",
    );
    await expect(
      dialog.getByLabel("Radius (meters)", { exact: true }),
    ).toHaveValue("35.5");
    expect(await page.evaluate(() => window.presenceMapMock.removed)).toBe(1);
    expect(await page.evaluate(() => window.presenceMapMock.cleared)).toBe(3);
    await page.evaluate(() => window.presenceMapMock.retiredClick?.());
    await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
      "0",
    );
    await expect(dialog.getByLabel("Longitude", { exact: true })).toHaveValue(
      "0",
    );
    expect(languages).toEqual(["en"]);
    expect(f.writes).toHaveLength(0);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.presenceMapMock.removed)).toBe(2);
    expect(await page.evaluate(() => window.presenceMapMock.cleared)).toBe(6);
    await page.getByRole("button", { name: "Add zone", exact: true }).click();
    await page.evaluate(() => window.presenceMapMock.retiredClick?.());
    await expect(
      page.getByRole("dialog").getByLabel("Latitude", { exact: true }),
    ).toHaveValue("");
    expect(f.writes).toHaveLength(0);
  });
}

test("Arabic first SDK language stays fixed when English controls return, geography remains LTR", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("vaylet_dashboard_locale", "ar"),
  );
  const languages = await mockPresenceMap(page);
  const f = new PresenceFixture();
  // Fixture's navigation helpers use English accessible names.
  await f.fixture.install(page);
  await page.goto("/policies");
  await page.evaluate(() => {
    localStorage.setItem("vaylet_dashboard_locale", "en");
    window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
  });
  const { signInOnCurrentPage } = await import("./support/foundation-ui");
  const { ORG_A, LOCATION_A } = await import("./support/fixture-data");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await page.evaluate(() => {
    localStorage.setItem("vaylet_dashboard_locale", "ar");
    window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
  });
  await page.getByRole("button", { name: "إضافة منطقة", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("الخريطة الجغرافية لمنطقة الحضور"),
  ).toBeVisible();
  await expect.poll(() => languages).toEqual(["ar"]);
  await page.evaluate(() => {
    localStorage.setItem("vaylet_dashboard_locale", "en");
    window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Map labels keep the language");
  await expect(
    dialog.getByLabel("Attendance Zone geographic map").locator(".."),
  ).toHaveAttribute("dir", "ltr");
  expect(languages).toEqual(["ar"]);
  expect(f.writes).toHaveLength(0);
});
