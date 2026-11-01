import { expect, test } from "@playwright/test";
import { PresenceFixture, lmBase } from "./support/presence-fixtures";
import { LOCATION_A, LOCATION_B } from "./support/dashboard-api-fixture";
import {
  installIssue407Map,
  map407State,
  replayRetired407Clicks,
} from "./support/issue407-map-sdk";
import { open407Studio, draft407Zone } from "./support/issue407-studio-fixture";
import { mockPresenceLocation } from "./support/presence-map-mock";

test("late shared SDK resolution creates only the current Location map", async ({
  page,
}) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await installIssue407Map(page, { wait });
  const fixture = new PresenceFixture("LM", (path, _request, state) => {
    if (!path.includes(LOCATION_B.locationId)) return undefined;
    if (path.endsWith("/policy"))
      return { body: { ...state.policy, locationId: LOCATION_B.locationId } };
    if (path.endsWith("/zones"))
      return { body: { items: [], nextCursor: null } };
    return undefined;
  });
  await open407Studio(page, fixture);
  await expect(
    page.getByText("Loading Google Maps", { exact: true }),
  ).toBeVisible();
  for (const location of [LOCATION_B, LOCATION_A]) {
    await page
      .locator(".topbar")
      .getByRole("button", { name: "Change scope", exact: true })
      .click();
    await page.getByRole("option", { name: new RegExp(location.name) }).click();
    await expect(page.locator(".ps-context-name")).toContainText(location.name);
    await expect(page.locator(".ps-zone-map")).toBeVisible();
    await expect(page.locator(".ps-map-caption")).toContainText(
      `Saved zones: ${location === LOCATION_B ? 0 : 1}`,
    );
  }
  release();
  await expect.poll(async () => (await map407State(page)).maps.length).toBe(1);
  expect(fixture.writes).toEqual([]);
});

test("SDK construction without tile completion times out honestly", async ({
  page,
}) => {
  await page.clock.install();
  await installIssue407Map(page, { tiles: false });
  await open407Studio(page);
  await expect.poll(async () => (await map407State(page)).maps.length).toBe(1);
  await expect(
    page.getByText("Loading Google Maps", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(20001);
  await expect(page.locator(".ps-map-feedback")).toContainText(
    "Google Maps could not load",
  );
  expect((await map407State(page)).circles).toEqual([]);
});

test("Location A→B→A clears protected overlays/drafts and retires old device and map callbacks", async ({
  page,
}) => {
  await installIssue407Map(page);
  await mockPresenceLocation(page);
  const fixture = new PresenceFixture("LM", (path, _request, state) => {
    if (!path.includes(LOCATION_B.locationId)) return undefined;
    if (path.endsWith("/policy"))
      return { body: { ...state.policy, locationId: LOCATION_B.locationId } };
    if (path.endsWith("/zones"))
      return { body: { items: [], nextCursor: null } };
    return undefined;
  });
  await open407Studio(page, fixture);
  await draft407Zone(page);
  await page.getByRole("button", { name: "SDK test click (no tiles)" }).click();
  await page
    .getByRole("button", { name: "Use my current location", exact: true })
    .click();
  page.on("dialog", (dialog) => dialog.accept());
  for (const location of [LOCATION_B, LOCATION_A]) {
    await page
      .locator(".topbar")
      .getByRole("button", { name: "Change scope", exact: true })
      .click();
    await page.getByRole("option", { name: new RegExp(location.name) }).click();
    await expect(page.locator(".ps-zone-form")).toHaveCount(0);
    await expect
      .poll(async () => (await map407State(page)).circles.length)
      .toBe(location === LOCATION_B ? 0 : 1);
  }
  await draft407Zone(page);
  await replayRetired407Clicks(page);
  await page.evaluate(() =>
    window.presenceGeo.success?.({
      coords: { latitude: 80, longitude: -80, accuracy: 1 },
    } as GeolocationPosition),
  );
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue("");
  expect(fixture.writes).toEqual([]);
});

test("unknown Save is submitted once and cannot fabricate confirmed geometry", async ({
  page,
}) => {
  await installIssue407Map(page);
  let mutationId = "";
  const fixture = new PresenceFixture("LM", (path, request, state) => {
    if (path === `${lmBase}/zones` && request.method() === "POST") {
      mutationId = request.postDataJSON().mutationId;
      return {
        status: 503,
        body: { code: "SERVER_ERROR", message: "Unknown outcome" },
      };
    }
    if (path.includes("/results/"))
      return {
        body: {
          mutationId,
          attribution: "UNKNOWN",
          effect: null,
          entityId: null,
          revision: null,
          canonical: {
            kind: "ZONE",
            value: { zone: state.zones[0], readiness: state.policy.readiness },
          },
        },
      };
    return undefined;
  });
  await open407Studio(page, fixture);
  await draft407Zone(page);
  await page.getByRole("button", { name: "SDK test click (no tiles)" }).click();
  await page
    .getByRole("button", { name: "Save", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.locator(".ps-zone-form")).toContainText(
    "Could not complete the request",
  );
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);
  expect(
    (await map407State(page)).titles.some((title) =>
      title.includes("New gate"),
    ),
  ).toBe(false);
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue("40");
});

test("server denies an edit before protected results can remain visible", async ({
  page,
}) => {
  await installIssue407Map(page);
  const fixture = new PresenceFixture("LM", (path, request) => {
    if (path === `${lmBase}/zones` && request.method() === "POST")
      return {
        status: 403,
        body: { code: "PRESENCE_SCOPE_DENIED", message: "Not authorized" },
      };
    return undefined;
  });
  await open407Studio(page, fixture);
  await draft407Zone(page);
  await page.getByRole("button", { name: "SDK test click (no tiles)" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".ps-zone-map")).toHaveCount(0);
  await expect(page.locator(".ps-zone-form")).toHaveCount(0);
  expect((await map407State(page)).circles).toEqual([]);
  expect(fixture.writes).toHaveLength(1);
});

for (const locale of ["en", "ar"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`map and manual fallback remain usable at four widths: ${locale}/${theme}`, async ({
      page,
    }) => {
      await installIssue407Map(page);
      const fixture = await open407Studio(page);
      await page.evaluate(
        ({ locale, theme }) => {
          localStorage.setItem("vaylet_dashboard_locale", locale);
          localStorage.setItem("vaylet_dashboard_theme", theme);
          dispatchEvent(new Event("vaylet-dashboard-locale-change"));
          dispatchEvent(new Event("vaylet-dashboard-theme-change"));
        },
        { locale, theme },
      );
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect
        .poll(async () => (await map407State(page)).maps.at(-1)?.scheme)
        .toBe(theme === "dark" ? "DARK" : "LIGHT");
      await page
        .getByRole("button", {
          name: locale === "ar" ? "إضافة منطقة" : "Add zone",
          exact: true,
        })
        .click();
      const latitude = page.getByLabel(
        locale === "ar" ? "خط العرض" : "Latitude",
        { exact: true },
      );
      await latitude.fill("0");
      await page
        .getByLabel(locale === "ar" ? "خط الطول" : "Longitude", { exact: true })
        .fill("0");
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const canvas = await page.locator(".ps-map-canvas").boundingBox();
        expect(canvas!.height).toBeGreaterThanOrEqual(320);
        expect(canvas!.width).toBeLessThanOrEqual(width);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
        await latitude.focus();
        await expect(latitude).toBeFocused();
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
          "INPUT",
        );
      }
      expect(fixture.writes).toEqual([]);
    });
  }
}
