import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
  selectLocation,
} from "./support/r06-locations";
import { signInOnCurrentPage } from "./support/foundation-ui";

const output = join(tmpdir(), "vaylet-md-r06", "candidate");

async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.getByTestId("md02-page").evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
}

async function screenshot(page: Page, name: string) {
  mkdirSync(output, { recursive: true });
  await settled(page);
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
}

test("CA Locations matches live reference geometry, dark surfaces, RTL and narrow reachability", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: {
      [ORG_A.organizationId]: [{ ...LOCATION_A, status: "INACTIVE" }],
    },
    override: (path) =>
      path === lifecyclePath ? { body: locationLifecycle() } : undefined,
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterLocations(page);
  await screenshot(page, "no-selection");
  await selectLocation(page);
  await settled(page);
  const scrollbar = await page
    .locator("main")
    .evaluate((element) => element.offsetWidth - element.clientWidth);
  // Required lifecycle content adds a native scrollbar absent in the short prototype.
  const title = page.getByRole("heading", { name: "Locations", level: 1 });
  const master = page.getByTestId("location-master");
  const detail = page.getByTestId("location-detail");
  const row = master.getByRole("button", { name: /Main Garage/ });
  // Measured live 3011 at 1440x900, Chromium, DPR1, 100% zoom.
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("line-height", "32px");
  expect(await title.boundingBox()).toMatchObject({
    x: 292,
    y: 96,
    height: 32,
  });
  expect(await master.boundingBox()).toMatchObject({
    x: 292,
    y: 176,
    width: 356 - scrollbar / 3,
  });
  expect(await detail.boundingBox()).toMatchObject({
    x: 672 - scrollbar / 3,
    y: 176,
    width: 736 - (2 * scrollbar) / 3,
  });
  expect(await row.boundingBox()).toMatchObject({
    x: 301,
    y: 232,
    width: 338 - scrollbar / 3,
    height: 68,
  });
  expect(await row.locator("span").first().boundingBox()).toMatchObject({
    width: 32,
    height: 32,
  });
  const addBox = await page
    .getByRole("button", { name: "Add Location", exact: true })
    .boundingBox();
  expect(addBox?.y).toBe(106);
  expect(addBox?.height).toBe(36);
  expect(addBox?.width).toBeCloseTo(140.578, 1);
  await expect(row).toHaveCSS("background-color", "rgba(239, 246, 255, 0.8)");
  await expect(row).toHaveCSS("border-color", "rgb(191, 219, 254)");
  await expect(detail).toHaveCSS("border-radius", "12px");
  expect(
    await detail.locator(":scope > div").first().boundingBox(),
  ).toMatchObject({ height: 256 });
  expect(
    await detail.getByRole("heading", { name: LOCATION_A.name }).boundingBox(),
  ).toMatchObject({ x: 697 - scrollbar / 3, y: 457, height: 32 });
  // TRUTHFUL_STATE: text facts replace prototype numeric metrics; retain its inset and separators.
  const facts = detail.locator("dl");
  expect(await facts.boundingBox()).toMatchObject({
    x: 697 - scrollbar / 3,
    y: 535,
    width: 686 - (2 * scrollbar) / 3,
  });
  await expect(facts).toHaveCSS("padding-top", "24px");
  await expect(facts).toHaveCSS("border-top-width", "1px");
  await expect(
    page.getByRole("button", { name: "Activate", exact: true }),
  ).toHaveCSS("min-height", "36px");
  await screenshot(page, "ca-en-light-inactive");

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(detail).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await expect(master).toHaveCSS("border-color", "rgb(23, 35, 70)");
  // ACCESSIBILITY: reference's pale selection has unreadable cyan text in dark.
  await expect(row).toHaveCSS("background-color", "rgb(19, 30, 61)");
  await screenshot(page, "ca-en-dark-desktop");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await screenshot(page, "ca-ar-desktop");
  await page.setViewportSize({ width: 480, height: 900 });
  await settled(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(480);
  expect((await detail.boundingBox())!.y).toBeGreaterThan(
    (await master.boundingBox())!.y,
  );
  await detail
    .getByRole("button", { name: "تفعيل", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    detail.getByRole("button", { name: "تفعيل", exact: true }),
  ).toBeInViewport();
  await screenshot(page, "ca-ar-narrow");
  await page.getByRole("button", { name: "اللغة", exact: true }).click();
  await screenshot(page, "ca-en-narrow");
  await page.getByRole("button", { name: "Add Location", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create Location" });
  await expect(dialog).toBeInViewport();
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(448);
  await screenshot(page, "create-narrow");
});

for (const blocked of [false, true]) {
  test(`active detail drain=${blocked} has reachable truthful controls`, async ({
    page,
  }) => {
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) =>
        path === lifecyclePath
          ? {
              body: locationLifecycle({
                status: "ACTIVE",
                acceptingIntake: !blocked,
                drain: {
                  blocked,
                  activeShiftPresent: blocked,
                  nonCompletedValetSessionPresent: blocked,
                  nonTerminalTaskPresent: blocked,
                },
              }),
            }
          : undefined,
    });
    await fixture.install(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLocations(page);
    await selectLocation(page);
    if (blocked)
      await expect(
        page.getByRole("button", { name: "Deactivate", exact: true }),
      ).toBeDisabled();
    else
      await expect(
        page.getByRole("button", { name: "Stop intake", exact: true }),
      ).toBeEnabled();
    await screenshot(page, blocked ? "blocked-drain" : "active-detail");
  });
}

test("LM exact scope remains truthful in EN, AR and narrow layouts", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/locations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page
      .getByTestId("location-detail")
      .getByRole("heading", { name: LOCATION_A.name }),
  ).toBeVisible();
  await screenshot(page, "lm-en-desktop");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await screenshot(page, "lm-ar-desktop");
  await page.setViewportSize({ width: 480, height: 900 });
  await screenshot(page, "lm-ar-narrow");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  await expect(
    page.getByRole("button", { name: /Add Location|إضافة موقع/ }),
  ).toHaveCount(0);
  for (const value of ["MAIN", "Asia/Amman", "JOD"])
    await expect(
      page.getByTestId("location-detail").getByText(value, { exact: true }),
    ).toHaveAttribute("dir", "ltr");
});

test("narrow create and nested MFA fit the viewport with long names", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: {
      [ORG_A.organizationId]: [
        { ...LOCATION_A, name: "LongLocationName".repeat(12) },
      ],
    },
    mfaState: "STEP_UP_REQUIRED",
    override: (path, request) =>
      path.endsWith("/locations") && request.method() === "POST"
        ? {
            status: 403,
            body: {
              code: "MFA_STEP_UP_REQUIRED",
              message: "Verification required",
              requestId: "narrow-mfa",
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 480, height: 900 });
  await enterLocations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  const { fillCreate } = await import("./support/r06-locations");
  const create = await fillCreate(page);
  await screenshot(page, "create-filled");
  await create
    .getByRole("button", { name: "Create Location", exact: true })
    .click();
  const mfa = page.getByRole("dialog", { name: "Verification required" });
  await expect(mfa.getByLabel(/authenticator code/)).toBeFocused();
  const box = (await mfa.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(480);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  await screenshot(page, "nested-mfa-narrow");
});
