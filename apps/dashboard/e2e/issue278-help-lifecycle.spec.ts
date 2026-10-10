import { expect, test, type Page } from "@playwright/test";
import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";
import {
  DashboardApiFixture, LOCATION_A, ORG_A, supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { operationsReadReply } from "./support/operations-fixtures";
import { managerReportsFixture, enterManagerReports, loadReport } from "./support/md05-reports-e2e-helpers";
import { Issue232PhysicalState } from "./support/issue232-physical-resources";
import { enterKeysSpots, openPhysicalResources } from "./support/keys-spots";

const help = (page: Page, key: ContextHelpKey) =>
  page.getByRole("button", { name: "Help: " + contextHelpRegistry[key].en.title, exact: true });

async function manager(page: Page, path: string, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto(path);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

test("route ownership unmounts stale Help, restores connected focus, and opens only new key", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => operationsReadReply(path),
  });
  await manager(page, "/vehicles", fixture);
  await help(page, "vehicles.page").click();
  await expect(page.getByRole("dialog", { name: contextHelpRegistry["vehicles.page"].en.title })).toBeVisible();
  // Simulates a real Next client navigation while a modal is open. A
  // permissions refresh can produce the same owner unmount asynchronously.
  await page.getByRole("link", { name: "Tasks", exact: true })
    .evaluate((link: HTMLAnchorElement) => link.click());
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(help(page, "vehicles.page")).toHaveCount(0);
  await expect(help(page, "tasks.page")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement;
    return !!active && active !== document.body && active.isConnected;
  })).toBe(true);
  await help(page, "tasks.page").click();
  await expect(page.getByRole("dialog", { name: contextHelpRegistry["tasks.page"].en.title })).toBeVisible();
});

test("logout invalidates open help and browser back cannot reveal it", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await manager(page, "/overview", fixture);
  await help(page, "overview.page").click();
  await page.getByRole("button", { name: "Sign out" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(help(page, "overview.page")).toHaveCount(0);
  await page.goBack();
  await expect(help(page, "overview.page")).toHaveCount(0);
});

test("no granted Location and denied Supervisor routes have no contextual help", async ({ page }) => {
  const missing = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [] },
  });
  await missing.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByRole("button", { name: /^Help:/u })).toHaveCount(0);

});

test("Supervisor cannot mount Intelligence help on a denied route", async ({ page }) => {
  const denied = new DashboardApiFixture({ operationalContexts: [supervisorContext()] });
  await denied.install(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await expect(page.getByRole("button", { name: /^Help:/u })).toHaveCount(0);
});

test("export Help nested in loaded preview preserves parent, focus and has no console errors/requests", async ({ page }) => {
  const fixture = managerReportsFixture();
  await fixture.install(page);
  await enterManagerReports(page);
  const preview = await loadReport(page, "DAILY");
  await expect(preview.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 12_000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const before = [...fixture.counts.entries()].sort();
  const exportHelp = help(page, "reports.export");
  await exportHelp.focus();
  await page.keyboard.press("Enter");
  const child = page.getByRole("dialog", { name: contextHelpRegistry["reports.export"].en.title });
  await expect(child).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(preview).toBeVisible();
  await expect(exportHelp).toBeFocused();
  await exportHelp.press("Space");
  await expect(child).toBeVisible();
  await child.getByRole("button", { name: "Close" }).click();
  await expect(preview).toBeVisible();
  expect([...fixture.counts.entries()].sort()).toEqual(before);
  expect(errors).toEqual([]);
});

test("Keys create modal retains first Code focus, unsaved draft and no mutations after nested help", async ({ page }) => {
  const physical = new Issue232PhysicalState(true);
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) {
        writes.push(path);
      }
      return physical.reply(path, request) ?? operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await enterKeysSpots(page);
  await openPhysicalResources(page);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const parent = page.getByRole("dialog", { name: "Add Key Slot" });
  const code = parent.getByRole("textbox", { name: "Code" });
  await expect(code).toBeFocused();
  await code.fill("UNSAVED-LOCAL-NOT-SUBMITTED");
  await page.waitForLoadState("networkidle", { timeout: 12_000 });
  const before = [...fixture.counts.entries()].sort();
  await help(page, "keys.resourceDetails").click();
  const child = page.getByRole("dialog", { name: contextHelpRegistry["keys.resourceDetails"].en.title });
  await expect(child).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(code).toHaveValue("UNSAVED-LOCAL-NOT-SUBMITTED");
  expect([...fixture.counts.entries()].sort()).toEqual(before);
  expect(writes).toEqual([]);
});

test("Reports preview retains historical Close-first focus and unsaved selector during nested Help", async ({ page }) => {
  const fixture = managerReportsFixture();
  await fixture.install(page);
  await enterManagerReports(page);
  await page.getByRole("button", { name: "Preview Daily Report" }).click();
  const parent = page.getByRole("dialog", { name: "Preview Daily Report" });
  await expect(parent).toBeVisible();
  await expect(parent.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  const date = parent.getByLabel("Date", { exact: true });
  await date.fill("2026-09-21");
  const before = [...fixture.counts.entries()].sort();
  await help(page, "reports.preview").click();
  const child = page.getByRole("dialog", { name: contextHelpRegistry["reports.preview"].en.title });
  await expect(child).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(date).toHaveValue("2026-09-21");
  expect([...fixture.counts.entries()].sort()).toEqual(before);
});
