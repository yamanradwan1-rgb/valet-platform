import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { companySettings } from "./support/administration-fixtures";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { captureIssue432State as captureState } from "./support/issue432-screenshot";
import { companyPolicy } from "./support/presence-data";

const evidenceDirectory = resolve(process.cwd(), "../../", "docs/plans/issue-432/qa-artifacts/real-dashboard");
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

function assertFixtureOnly(network: ReturnType<typeof watchRequests>, fixture: DashboardApiFixture, since: number) {
  expect([...fixture.counts.values()].reduce((total, count) => total + count, 0)).toBe(network.staff.length);
  const calls = network.staff.slice(since);
  expect(calls.filter(({ method, path }) => method !== "GET" && !path.startsWith("/v1/staff/auth/"))).toEqual([]);
  expect(calls.filter(({ path }) => path.toLowerCase().includes("alert"))).toEqual([]);
  expect(network.external).toEqual([]);
  expect(network.unmockedApi).toEqual([]);
  expect(network.nonStaffWrites).toEqual([]);
}

async function ensureEnglish(page: Page) {
  if (await page.locator("html").getAttribute("lang") !== "en") await page.getByRole("button", { name: /Language|اللغة/u }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
}

async function openDashboard(page: Page, fixture: DashboardApiFixture, path: string) {
  await fixture.install(page);
  await page.goto(path);
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

async function readGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return [bounds.x, bounds.y, bounds.width, bounds.height].map((value) => Math.round(value));
    };
    return { shell: rect(".shell"), sidebar: rect(".sidebar"), topbar: rect(".topbar"), shellMain: rect(".shell-main"), content: rect(".content"), policies: rect(".ps-workspace") };
  });
}

test("baseline route keeps the original alerts control and prototype preserves Operations", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = createFixture();
  const network = watchRequests(page);
  await openDashboard(page, fixture, "/policies?section=operations");
  const baselineText = await page.locator(".ps-workspace").innerText();
  const baselineLinks = await page.locator("a[aria-current='page']").evaluateAll((nodes) => nodes.map((node) => ({
    href: (node as HTMLAnchorElement).getAttribute("href"), text: node.textContent?.trim() ?? "",
  })));
  await page.setViewportSize({ width: 1440, height: 900 });
  const baselineGeometry = await readGeometry(page);
  const legacyBell = page.locator(".management-alert-bell");
  const legacyPanel = page.locator(".management-alert-panel");
  mkdirSync(evidenceDirectory, { recursive: true });
  if (await legacyBell.count()) {
    await expect(legacyBell).toBeVisible();
    await legacyBell.click();
    await expect(legacyPanel).toBeVisible();
    await expect(page.locator(".alerts-panel")).toHaveCount(0);
    await page.screenshot({
      path: resolve(evidenceDirectory, "variant-baseline-en-light-1440x900-state-baseline-alerts-open.png"),
      animations: "disabled", caret: "hide", style: "nextjs-portal { display: none !important; }",
    });
    await legacyPanel.getByRole("button", { name: "Close", exact: true }).click();
    await expect(legacyPanel).toHaveCount(0);
  } else {
    await expect(legacyBell).toHaveCount(0);
    await expect(legacyPanel).toHaveCount(0);
    await expect(page.locator(".alerts-panel")).toHaveCount(0);
  }
  await expect(page.locator(".issue432-prototype-tools")).toHaveCount(0);
  await page.screenshot({
    path: resolve(evidenceDirectory, "variant-baseline-en-light-1440x900-state-dashboard-baseline.png"),
    animations: "disabled", caret: "hide", style: "nextjs-portal { display: none !important; }",
  });

  const prototypeRequestStart = network.staff.length;
  await page.goto("/policies?section=operations&prototype=alerts&variant=a");
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.locator(".management-alert-bell")).toBeVisible();
  await expect(page.locator(".alerts-panel")).toHaveCount(0);
  await expect(page.locator(".issue432-prototype-tools")).toHaveCount(0);
  await expect(page.locator(".ps-section-links a[aria-current='page']")).toHaveAttribute("href", "/policies?section=operations");
  expect(await page.locator(".ps-workspace").innerText()).toBe(baselineText);
  expect(await readGeometry(page)).toEqual(baselineGeometry);
  expect(await page.locator("a[aria-current='page']").evaluateAll((nodes) => nodes.map((node) => ({
    href: (node as HTMLAnchorElement).getAttribute("href"), text: node.textContent?.trim() ?? "",
  })))).toEqual(baselineLinks);
  await page.screenshot({
    path: resolve(evidenceDirectory, "variant-a-en-light-1440x900-state-prototype-bell-closed.png"),
    animations: "disabled", caret: "hide", style: "nextjs-portal { display: none !important; }",
  });
  assertFixtureOnly(network, fixture, prototypeRequestStart);
});

test("ALT-08 opens only its local synthetic destination and preserves distinct destination states", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = createFixture();
  const network = watchRequests(page);
  await openDashboard(page, fixture, "/policies?section=operations&prototype=alerts&variant=a");
  await page.setViewportSize({ width: 1440, height: 900 });
  const prototypeRequestStart = network.staff.length;
  await page.keyboard.press("Control+Shift+P");
  const controls = page.getByRole("complementary", { name: "Demo controls" });
  await expect(controls).toBeVisible();
  const scenario = controls.getByLabel("State fixtures");
  await scenario.selectOption("one");
  const panel = await openPanel(page);
  const link = panel.getByTestId("synthetic-destination-link");
  await expect(link).toBeVisible();
  await expect(panel.getByTestId("synthetic-destination-link")).toHaveCount(1);
  await expect(link).toHaveAccessibleName(/SIM-INC-1042/u);
  await expect(link).toHaveAttribute("href", "#SIM-TARGET-INCIDENT-1042");
  await expect(link).toHaveAttribute("data-source-id", "SIM-INC-1042");
  await expect(link).toHaveAttribute("data-target-id", "SIM-TARGET-INCIDENT-1042");
  const before = new URL(page.url());
  await link.click();
  const after = new URL(page.url());
  expect(after.origin).toBe(before.origin);
  expect(after.pathname + after.search).toBe(before.pathname + before.search);
  expect(after.hash).toBe("#SIM-TARGET-INCIDENT-1042");
  const preview = page.getByTestId("synthetic-destination-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toBeFocused();
  await expect(preview).toHaveAttribute("id", "SIM-TARGET-INCIDENT-1042");
  await expect(preview).toContainText(/no production record/i);
  await expect(preview).toContainText("Source ID: SIM-INC-1042");
  await expect(preview).toContainText("Target ID: SIM-TARGET-INCIDENT-1042");
  await expect(panel.locator('[data-category="ALT-08"]')).toHaveCount(1);
  await expect(panel.locator('[data-category="ALT-08"] .seen-action')).toHaveCount(0);
  await captureState(page, "synthetic-destination");

  await scenario.selectOption("destination-unavailable");
  for (const state of ["unavailable", "missing", "unauthorized"] as const) {
    const status = panel.locator(`[data-testid="synthetic-destination-status"][data-destination-state="${state}"]`);
    await expect(status).toHaveCount(1);
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute("data-destination-state", state);
    await expect(status.locator("xpath=ancestor::a")).toHaveCount(0);
  }
  await captureState(page, "destination-unavailable-missing-unauthorized");

  await panel.locator(".alerts-close").click();
  await scenario.selectOption("multiple");
  await page.keyboard.press("Control+Shift+P");
  await expect(controls).toBeHidden();
  await openPanel(page);
  const occurrenceActions = panel.locator('[data-kind="OCCURRENCE"] .seen-action');
  await expect(occurrenceActions).toHaveCount(2);
  await occurrenceActions.last().click();
  await expect(occurrenceActions).toHaveCount(1);
  await expect(occurrenceActions.first()).toBeFocused();
  await occurrenceActions.first().click();
  await expect(occurrenceActions).toHaveCount(0);
  await expect(panel.locator(".alerts-close")).toBeFocused();
  await captureState(page, "seen-focus-no-eligible-close");

  assertFixtureOnly(network, fixture, prototypeRequestStart);
});

test("a fresh authenticated Dashboard tab restores the local synthetic fragment preview", async ({ page }) => {
  test.setTimeout(120_000);
  const freshPage = await page.context().newPage();
  const fixture = createFixture();
  const network = watchRequests(freshPage);
  await freshPage.addInitScript(() => localStorage.setItem("vaylet_dashboard_locale", "en"));
  await openDashboard(freshPage, fixture, "/policies?section=operations&prototype=alerts&variant=a");
  const prototypeRequestStart = network.staff.length;
  await freshPage.goto("/policies?section=operations&prototype=alerts&variant=a#SIM-TARGET-INCIDENT-1042");
  await expect(freshPage).toHaveURL(/#SIM-TARGET-INCIDENT-1042$/u);
  const panel = freshPage.locator(".alerts-panel");
  await expect(panel).toBeVisible();
  const preview = freshPage.getByTestId("synthetic-destination-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toBeFocused();
  await expect(panel.getByTestId("synthetic-destination-link")).toHaveCount(1);
  await captureState(freshPage, "fragment-reload-preview");
  assertFixtureOnly(network, fixture, prototypeRequestStart);
  await freshPage.close();
});
