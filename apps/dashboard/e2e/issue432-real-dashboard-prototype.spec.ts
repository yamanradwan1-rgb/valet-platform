import { expect, test, type Page } from "@playwright/test";
import { companySettings } from "./support/administration-fixtures";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { captureIssue432State as captureState } from "./support/issue432-screenshot";
import { companyPolicy } from "./support/presence-data";
const companySettingsPath = "/v1/staff/management/organizations/" + ORG_A.organizationId + "/settings";

test.beforeEach(async ({ page }) => page.addInitScript(() => localStorage.setItem("vaylet_dashboard_locale", "en")));

async function ensureLocale(page: Page, locale: "en" | "ar") {
  if (await page.locator("html").getAttribute("lang") !== locale) await page.getByRole("button", { name: /Language|اللغة/u }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
}

function dashboardReadFixture(path: string) {
  if (path.endsWith("/shift-presence/policy")) return { body: companyPolicy() };
  if (path.includes("/shift-presence/") && /\/(zones|exceptions)$/u.test(path)) {
    return { body: { items: [], nextCursor: null } };
  }
  if (path.endsWith("/whatsapp-settings")) {
    return {
      body: {
        organizationId: ORG_A.organizationId,
        locationId: null,
        policy: {
          enabled: null, language: null, templateCatalogVersion: null,
          providerBindingId: null, revision: 0,
        },
        companyDefault: null,
        globalSendEnabled: false,
        activationReady: false,
        approvedTemplateVersions: [],
        connections: [],
      },
    };
  }
  return undefined;
}
function createCompanyAdminFixture() {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === companySettingsPath && request.method() === "GET") {
        return { body: companySettings() };
      }
      return dashboardReadFixture(path);
    },
  });
}
function watchRequests(page: Page) {
  const staff: { method: string; path: string }[] = [];
  const externalNonStaff: string[] = [];
  const unmockedApi: string[] = [];
  const nonStaffWrites: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.startsWith("/v1/staff/")) {
      staff.push({ method, path: url.pathname });
    } else {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/")) unmockedApi.push(url.origin + url.pathname);
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) nonStaffWrites.push(method + " " + url.origin + url.pathname);
      if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) externalNonStaff.push(url.origin + url.pathname);
    }
  });
  return { staff, externalNonStaff, unmockedApi, nonStaffWrites };
}
async function openRealDashboard(
  page: Page,
  variant: "a" | "b",
  fixture: DashboardApiFixture,
) {
  await fixture.install(page);
  await page.goto("/policies?section=operations&prototype=alerts&variant=" + variant);
  await expect.poll(async () => {
    const body = await page.locator("body").innerText();
    return body.includes("Sign in") || body.includes("Choose your authorized workspace");
  }, { timeout: 20_000 }).toBe(true);
  if (await page.getByRole("heading", { name: "Sign in" }).count()) {
    await signInOnCurrentPage(page);
  }
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText("Loading authorized scope…")).toHaveCount(0);
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.locator('[data-setting="checkInPhotosRequired"]')).toBeVisible();
  await expect(page.locator(".ps-pane-header h2")).toBeVisible();
  await expect(page.locator(".ps-section-links a[aria-current='page']"))
    .toHaveAttribute("href", "/policies?section=operations");
  await expect(page).toHaveURL(/section=operations/u);
  await expect(page.locator(".management-alert-bell")).toBeVisible();
}
async function openPanel(page: Page) {
  await page.locator(".management-alert-bell").click();
  const panel = page.locator(".alerts-panel");
  await expect(panel).toBeVisible();
  return panel;
}
async function captureViewport(
  page: Page,
  variant: "a" | "b",
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  const bell = page.locator(".management-alert-bell");
  await expect(bell).toBeVisible();
  const panel = await openPanel(page);
  await expect(panel).toHaveClass(new RegExp("alerts-panel--" + variant));
  await expect(panel.locator(".alerts-foot")).toBeVisible();
  expect(await panel.evaluate((element) => Number(getComputedStyle(element).zIndex))).toBe(40);
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
  expect(bounds!.width).toBe(Math.min(416, width - 32));
  await captureState(page, "dropdown-open", variant);
  await page.getByRole("button", { name: /Close notifications|إغلاق التنبيهات/u }).click();
  await expect(panel).toHaveCount(0);
}
async function captureTwoTimesPageScale(page: Page, variant: "a" | "b") {
  await page.setViewportSize({ width: 720, height: 900 });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  const viewport = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }));
  await page.locator(".management-alert-bell").focus();
  await page.keyboard.press("Enter");
  const panel = page.locator(".alerts-panel");
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await captureState(page, "page-scale-2x", variant);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();
  await page.setViewportSize({ width: 1440, height: 900 });
}
function expectNoExternalWrites(
  network: ReturnType<typeof watchRequests>,
  fixture: DashboardApiFixture,
  since = 0,
) {
  expect(fixture.count("/v1/staff/management/organizations")).toBeGreaterThan(0);
  expect([...fixture.counts.values()].reduce((total, count) => total + count, 0))
    .toBe(network.staff.length);
  const scopedCalls = network.staff.slice(since);
  expect(scopedCalls.filter(({ method, path }) =>
    method !== "GET" && !path.startsWith("/v1/staff/auth/"),
  )).toEqual([]);
  expect(scopedCalls.filter(({ path }) => path.toLowerCase().includes("alert"))).toEqual([]);
  expect(network.externalNonStaff).toEqual([]);
  expect(network.unmockedApi).toEqual([]);
  expect(network.nonStaffWrites).toEqual([]);
}
for (const variant of ["a", "b"] as const) {
  test("real Dashboard prototype " + variant.toUpperCase() + ": responsive, EN/AR and theme", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const fixture = createCompanyAdminFixture();
    const network = watchRequests(page);
    await openRealDashboard(page, variant, fixture);
    await page.setViewportSize({ width: 1440, height: 900 });
    await captureState(page, "bell-closed", variant);

    const bell = page.locator(".management-alert-bell");
    const bellStyle = await bell.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        borderWidth: style.borderTopWidth,
        borderStyle: style.borderTopStyle,
      };
    });
    expect(bellStyle).toEqual({
      width: 44,
      height: 44,
      borderWidth: "0px",
      borderStyle: "none",
    });
    const liveStatus = page.locator(".issue432-sr-only");
    await expect(liveStatus).toHaveAttribute("role", "status");
    await expect(liveStatus).toHaveAttribute("aria-live", "polite");
    const liveStatusStyle = await liveStatus.evaluate((element) => {
      const style = getComputedStyle(element);
      return { position: style.position, width: style.width, height: style.height, overflow: style.overflow, clip: style.clip };
    });
    expect(liveStatusStyle).toEqual({
      position: "absolute", width: "1px", height: "1px", overflow: "hidden",
      clip: "rect(0px, 0px, 0px, 0px)",
    });

    for (const width of [320, 390, 768, 1280, 1440]) {
      await captureViewport(page, variant, width, width < 768 ? 844 : 900);
    }
    await captureViewport(page, variant, 320, 568);
    await captureTwoTimesPageScale(page, variant);
    await captureViewport(page, variant, 720, 370);

    await page.locator(".theme-segment").nth(1).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    for (const width of [390, 1280]) {
      await captureViewport(page, variant, width, width < 768 ? 844 : 900);
    }
    await page.locator(".theme-segment").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await ensureLocale(page, "ar");
    for (const width of [390, 1280]) {
      await captureViewport(page, variant, width, width < 768 ? 844 : 900);
    }
    await page.locator(".theme-segment").nth(1).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    for (const width of [390, 1280]) {
      await captureViewport(page, variant, width, width < 768 ? 844 : 900);
    }
    await ensureLocale(page, "en");
    await page.locator(".theme-segment").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expectNoExternalWrites(network, fixture);
  });
}
