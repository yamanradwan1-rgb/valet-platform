import { expect, test, type Page } from "@playwright/test";
import { companySettings } from "./support/administration-fixtures";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { holdIssue432AnimationFrames } from "./support/issue432-held-animation-frames";
import { captureIssue432State as captureState } from "./support/issue432-screenshot";
import { companyPolicy } from "./support/presence-data";

const companySettingsPath = "/v1/staff/management/organizations/" + ORG_A.organizationId + "/settings";

test.beforeEach(async ({ page }) => page.addInitScript(() => localStorage.setItem("vaylet_dashboard_locale", "en")));

function dashboardReadFixture(path: string) {
  if (path.endsWith("/shift-presence/policy")) return { body: companyPolicy() };
  if (path.includes("/shift-presence/") && /\/(zones|exceptions)$/u.test(path)) return { body: { items: [], nextCursor: null } };
  if (path.endsWith("/whatsapp-settings")) return { body: {
    organizationId: ORG_A.organizationId, locationId: null,
    policy: { enabled: null, language: null, templateCatalogVersion: null, providerBindingId: null, revision: 0 },
    companyDefault: null, globalSendEnabled: false, activationReady: false,
    approvedTemplateVersions: [], connections: [],
  } };
  return undefined;
}

function createFixture() {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A], companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === companySettingsPath && request.method() === "GET"
      ? { body: companySettings() } : dashboardReadFixture(path),
  });
}

function watchRequests(page: Page) {
  const staff: { method: string; path: string }[] = [];
  const external: string[] = [];
  const unmockedApi: string[] = [];
  const nonStaffWrites: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.startsWith("/v1/staff/")) staff.push({ method, path: url.pathname });
    else {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/")) unmockedApi.push(url.origin + url.pathname);
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) nonStaffWrites.push(method + " " + url.origin + url.pathname);
      if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) external.push(url.origin + url.pathname);
    }
  });
  return { staff, external, unmockedApi, nonStaffWrites };
}

function assertFixtureOnly(network: ReturnType<typeof watchRequests>, fixture: DashboardApiFixture) {
  expect([...fixture.counts.values()].reduce((total, count) => total + count, 0)).toBe(network.staff.length);
  expect(network.staff.filter(({ method, path }) => method !== "GET" && !path.startsWith("/v1/staff/auth/"))).toEqual([]);
  expect(network.staff.filter(({ path }) => path.toLowerCase().includes("alert"))).toEqual([]);
  expect(network.external).toEqual([]);
  expect(network.unmockedApi).toEqual([]);
  expect(network.nonStaffWrites).toEqual([]);
}

async function ensureEnglish(page: Page) {
  if (await page.locator("html").getAttribute("lang") !== "en") await page.getByRole("button", { name: /Language|اللغة/u }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
}

async function openDashboard(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/policies?section=operations&prototype=alerts&variant=a");
  await expect.poll(async () => {
    const body = await page.locator("body").innerText();
    return body.includes("Sign in") || body.includes("Choose your authorized workspace");
  }, { timeout: 20_000 }).toBe(true);
  if (await page.getByRole("heading", { name: "Sign in" }).count()) await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText("Loading authorized scope…")).toHaveCount(0);
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.locator('[data-setting="checkInPhotosRequired"]')).toBeVisible();
  await ensureEnglish(page);
}

async function openPanel(page: Page) {
  await page.locator(".management-alert-bell").click();
  const panel = page.locator(".alerts-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test("prototype popover preserves keyboard order, focus exit, close and Seen recovery", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = createFixture();
  const network = watchRequests(page);
  await openDashboard(page, fixture);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press("Control+Shift+P");
  const controls = page.getByRole("complementary", { name: "Demo controls" });
  await expect(controls).toBeVisible();
  const scenario = controls.getByLabel("State fixtures");
  await scenario.selectOption("multiple");
  await page.keyboard.press("Control+Shift+P");
  await expect(controls).toBeHidden();
  const bell = page.locator(".management-alert-bell");
  const themeControl = page.locator(".theme-segment").nth(1);
  const panel = page.locator(".alerts-panel");
  const seenActions = panel.locator(".seen-action");
  const heldFrames = await holdIssue432AnimationFrames(page);
  try {
    await bell.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveCSS("visibility", "hidden");
    await page.keyboard.press("Tab");
    await expect(bell).toBeFocused();
    await expect(bell).toHaveAttribute("aria-expanded", "true");
    expect(await heldFrames.queuedCount()).toBeGreaterThan(0);
  } finally {
    await heldFrames.release();
  }
  await expect(panel).toBeVisible();
  await expect(panel.locator(".alerts-close")).toBeFocused();
  await captureState(page, "keyboard-open-geometry-released-close");
  await page.keyboard.press("Tab");
  await expect(seenActions.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(panel.locator(".alerts-close")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(bell).toBeFocused();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeFocused();
  await expect(panel).toHaveCount(0);

  await openPanel(page);
  const link = panel.getByTestId("synthetic-destination-link");
  await expect(link).toHaveCount(1);
  await expect(seenActions).toHaveCount(2);

  await page.keyboard.press("Tab");
  await expect(panel.locator(".alerts-close")).toBeFocused();
  await captureState(page, "pointer-tab-close");
  await page.keyboard.press("Tab");
  await expect(seenActions.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(seenActions.nth(1)).toBeFocused();
  await captureState(page, "keyboard-order-close-seen-link-seen");
  await page.keyboard.press("Shift+Tab");
  await expect(link).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(seenActions.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(panel.locator(".alerts-close")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(bell).toBeFocused();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeFocused();
  await expect(panel).toHaveCount(0);

  await bell.click();
  await expect(panel).toBeVisible();
  await panel.locator(".alerts-close").click();
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();

  await bell.click();
  await expect(panel).toBeVisible();
  await themeControl.focus();
  await expect(panel).toHaveCount(0);
  await expect(themeControl).toBeFocused();
  await themeControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator(".theme-segment").first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.keyboard.press("Control+Shift+P");
  await expect(controls).toBeVisible();
  await scenario.selectOption("overflow");
  await page.keyboard.press("Control+Shift+P");
  await expect(controls).toBeHidden();
  await bell.click();
  await expect(panel).toBeVisible();
  const seenCount = await seenActions.count();
  expect(seenCount).toBeGreaterThan(2);
  const nextTitle = await seenActions.nth(2).locator("xpath=ancestor::li").locator("strong").innerText();
  await seenActions.nth(1).click();
  await expect(panel.locator(".seen-action")).toHaveCount(seenCount - 1);
  const nextSeen = panel.locator(".seen-action").nth(1);
  await expect(nextSeen).toBeFocused();
  await expect(nextSeen.locator("xpath=ancestor::li").locator("strong")).toHaveText(nextTitle);
  await captureState(page, "seen-focus-middle-next");
  const actionsBeforeLast = panel.locator(".seen-action");
  const actionsBeforeLastCount = await actionsBeforeLast.count();
  expect(actionsBeforeLastCount).toBeGreaterThan(1);
  const precedingSeen = actionsBeforeLast.nth(actionsBeforeLastCount - 2);
  const precedingTitle = await precedingSeen.locator("xpath=ancestor::li").locator("strong").innerText();
  await actionsBeforeLast.last().click();
  await expect(panel.locator(".seen-action")).toHaveCount(seenCount - 2);
  const nearestPrecedingSeen = panel.locator(".seen-action").last();
  await expect(nearestPrecedingSeen).toBeFocused();
  await expect(nearestPrecedingSeen.locator("xpath=ancestor::li").locator("strong")).toHaveText(precedingTitle);
  await captureState(page, "seen-focus-last-previous");
  await panel.locator(".alerts-close").click();
  await expect(bell).toBeFocused();

  await page.keyboard.press("Control+Shift+P");
  await expect(controls).toBeVisible();
  await scenario.selectOption("one");
  await page.keyboard.press("Control+Shift+P");
  await expect(controls).toBeHidden();
  await bell.click();
  await expect(panel).toBeVisible();
  const destinationLink = panel.getByTestId("synthetic-destination-link");
  const preview = page.getByTestId("synthetic-destination-preview");
  await expect(destinationLink).toBeVisible();
  await page.evaluate(() => {
    const current = new URL(window.location.href);
    current.hash = "";
    window.history.replaceState(window.history.state, "", current.pathname + current.search);
  });
  await destinationLink.click();
  await expect(page).toHaveURL(/#SIM-TARGET-INCIDENT-1042$/u);
  await expect(preview).toBeFocused();
  await page.goBack();
  await expect(page).not.toHaveURL(/#SIM-TARGET-INCIDENT-1042$/u);
  await expect(panel).toBeVisible();
  await expect(destinationLink).toBeVisible();
  await expect(panel.locator('[data-category="ALT-08"]')).toHaveCount(1);
  await page.goForward();
  await expect(page).toHaveURL(/#SIM-TARGET-INCIDENT-1042$/u);
  await expect(panel).toBeVisible();
  await expect(preview).toBeFocused();
  await captureState(page, "hash-forward-preview");
  assertFixtureOnly(network, fixture);
});

test("a hash-opened panel closes on Back and reopens on Forward", async ({ page }) => {
  test.setTimeout(120_000);
  const freshPage = await page.context().newPage();
  const fixture = createFixture();
  const network = watchRequests(freshPage);
  await freshPage.addInitScript(() => localStorage.setItem("vaylet_dashboard_locale", "en"));
  await openDashboard(freshPage, fixture);
  const panel = freshPage.locator(".alerts-panel");
  await expect(panel).toHaveCount(0);
  await freshPage.evaluate(() => {
    const current = new URL(window.location.href);
    current.hash = "";
    const state = window.history.state;
    window.history.replaceState(state, "", current.pathname + current.search);
    window.history.pushState(state, "", current.pathname + current.search);
  });
  const historyBeforeHash = await freshPage.evaluate(() => ({
    length: window.history.length,
    stateKeys: window.history.state && typeof window.history.state === "object" ? Object.keys(window.history.state).sort() : [],
  }));
  expect(historyBeforeHash.stateKeys).toContain("__NA");
  await freshPage.evaluate(() => { window.location.hash = "SIM-TARGET-INCIDENT-1042"; });
  const historyAfterHash = await freshPage.evaluate(() => ({
    length: window.history.length,
    href: window.location.href,
    stateKeys: window.history.state && typeof window.history.state === "object" ? Object.keys(window.history.state).sort() : [],
  }));
  expect(historyAfterHash.length).toBeGreaterThan(historyBeforeHash.length);
  await expect(freshPage).toHaveURL(/#SIM-TARGET-INCIDENT-1042$/u);
  await expect(panel).toBeVisible();
  const preview = freshPage.getByTestId("synthetic-destination-preview");
  await expect(preview).toBeFocused();
  await freshPage.goBack();
  const historyAfterBack = await freshPage.evaluate(() => ({
    length: window.history.length,
    href: window.location.href,
    stateKeys: window.history.state && typeof window.history.state === "object" ? Object.keys(window.history.state).sort() : [],
  }));
  expect(historyAfterBack.length).toBe(historyAfterHash.length);
  expect(historyAfterBack.stateKeys).toContain("__NA");
  await expect(freshPage).not.toHaveURL(/#SIM-TARGET-INCIDENT-1042$/u);
  await expect(panel).toHaveCount(0);
  await freshPage.goForward();
  const historyAfterForward = await freshPage.evaluate(() => ({
    length: window.history.length,
    href: window.location.href,
    stateKeys: window.history.state && typeof window.history.state === "object" ? Object.keys(window.history.state).sort() : [],
  }));
  expect(historyAfterForward.length).toBe(historyAfterHash.length);
  expect(historyAfterForward.href).toContain("#SIM-TARGET-INCIDENT-1042");
  await expect(freshPage).toHaveURL(/#SIM-TARGET-INCIDENT-1042$/u);
  await expect(panel).toBeVisible();
  await expect(preview).toBeFocused();
  await captureState(freshPage, "hash-forward-reopen");
  assertFixtureOnly(network, fixture);
  await freshPage.close();
});
