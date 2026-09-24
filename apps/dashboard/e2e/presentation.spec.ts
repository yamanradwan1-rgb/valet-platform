import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  openLocationManagerWorkspace,
} from "./support/foundation-ui";

function locationManagerFixture(): DashboardApiFixture {
  return new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
}

test("theme and locale switch the real document between light/LTR and dark/RTL", async ({
  page,
}) => {
  const fixture = locationManagerFixture();
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("lang", "en");
  await expect(root).toHaveAttribute("dir", "ltr");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".shell")).toHaveCSS(
    "background-color",
    "rgb(7, 12, 24)",
  );
  await expect(page.locator(".topbar")).toHaveCSS(
    "background-color",
    "rgb(11, 19, 43)",
  );
  await page.getByRole("button", { name: "Language" }).click();
  await expect(root).toHaveAttribute("lang", "ar");
  await expect(root).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".sidebar-collapse svg")).toHaveCSS(
    "transform",
    "matrix(-1, 0, 0, 1, 0, 0)",
  );
  await expect(
    page.getByRole("heading", { name: "نظرة عامة" }),
  ).toBeVisible();
});

test("mobile navigation traps focus, closes on Escape, and restores the opener", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = locationManagerFixture();
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  const opener = page.getByRole("button", { name: "Open navigation" });
  await expect(opener).toBeVisible();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Management navigation" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img").nth(1)).toHaveAttribute(
    "src",
    /vaylet-text-dark/u,
  );
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  const focusable = dialog.locator(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  await expect(focusable.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("foundation shell keeps unsupported global controls absent with MD-02 navigation", async ({ page }) => {
  const fixture = locationManagerFixture();
  await fixture.install(page);
  await openLocationManagerWorkspace(page);
  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  for (const name of [
    "Employees & Shifts",
    "Locations",
    "Policies & Settings",
    "Branding",
    "Billing & Subscription",
  ]) {
    await expect(navigation.getByRole("link", { name })).toBeVisible();
  }
  await expect(navigation.getByRole("link", { name: "Roles & Permissions" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Integrations" })).toHaveCount(0);

  for (const name of ["Profile", "Notifications", "Messages", "Search"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("searchbox")).toHaveCount(0);
});

test("foundation shell preserves the frozen sidebar, topbar, and scroll geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = locationManagerFixture();
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  const sidebar = page.locator(".sidebar");
  const topbar = page.locator(".topbar");
  const content = page.locator(".content");
  const contentInner = page.locator(".content-inner");
  const scopeSelector = sidebar.locator(".sidebar-scope");
  const locationSelector = topbar.locator(".location-context");
  const firstNavigationLink = sidebar.locator(".sidebar-navigation .nav-link").first();
  const utilities = sidebar.locator(".sidebar-utilities");

  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText(ORG_A.name)).toBeVisible();
  await expect(topbar.getByText(LOCATION_A.name)).toBeVisible();
  await expect(
    topbar.getByRole("group", { name: "Theme" }).getByRole("button"),
  ).toHaveText(["Light", "Dark"]);
  await expect(
    sidebar.locator(".sidebar-utilities").getByRole("link"),
  ).toHaveText(["Security", "Help"]);

  const emblemSrc = await sidebar.locator("img").first().getAttribute("src");
  expect(emblemSrc).toContain("vaylet-emblem");
  const expandedWidth = await sidebar.evaluate((element) =>
    Math.round(element.getBoundingClientRect().width),
  );
  expect(expandedWidth).toBe(260);
  await expect(topbar).toHaveCSS("height", "64px");
  await expect(scopeSelector).toHaveCSS("height", "53px");
  await expect(locationSelector).toHaveCSS("height", "40px");
  await expect(firstNavigationLink).toHaveCSS("height", "32px");
  await expect(utilities).toHaveCSS("height", "125px");

  const geometry = await content.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowY: style.overflowY,
      paddingTop: style.paddingTop,
    };
  });
  expect(geometry).toEqual({ overflowY: "auto", paddingTop: "32px" });
  await expect(contentInner).toHaveCSS("max-width", "1600px");
  const shellHeight = await page.locator(".shell").evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );
  expect(shellHeight).toBe(900);

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const collapsedWidth = await sidebar.evaluate((element) =>
    Math.round(element.getBoundingClientRect().width),
  );
  expect(collapsedWidth).toBe(80);
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
});

test("thin protected routes reuse the same authorized frame and selected scope", async ({
  page,
}) => {
  const fixture = locationManagerFixture();
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  await page.getByRole("link", { name: "Help" }).click();
  await expect(
    page.getByRole("heading", { name: "Help and product guidance" }),
  ).toBeVisible();
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
});
