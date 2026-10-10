import { expect, test, type Page } from "@playwright/test";

import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";
import { helpSectionManifest } from "../src/features/help/help-section-manifest";
import { DashboardApiFixture, LOCATION_A, ORG_A, supervisorContext } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { operationsReadReply, sessionItem } from "./support/operations-fixtures";

const routes = [
  { path: "/live-operations", key: "live.page", group: "liveOperations" },
  { path: "/vehicles", key: "vehicles.page", group: "vehicles" },
  { path: "/tasks", key: "tasks.page", group: "tasks" },
  { path: "/maps-zones", key: "maps.page", group: "maps" },
  { path: "/keys", key: "keys.page", group: "keys" },
  { path: "/incidents", key: "incidents.page", group: "incidents" },
] as const;

function trigger(page: Page, key: ContextHelpKey) {
  return page.getByRole("button", { name: "Help: " + contextHelpRegistry[key].en.title, exact: true });
}

async function enterManager(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

test("six Operations pages mount one exact authorized header help and never issue help requests", async ({ page }, testInfo) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (!["GET", "HEAD"].includes(request.method()) && !path.startsWith("/v1/staff/auth/")) {
        writes.push(request.method() + " " + path);
      }
      if (path.endsWith("/overview/live-sessions")) {
        return { body: { items: [{ ...sessionItem(), checkedInBy: null, parkedBy: null,
          parkingCompletionProof: "NO_RECORD" }], nextCursor: null } };
      }
      return operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await enterManager(page, "/live-operations");
  for (const { path, key, group } of routes) {
    await page.goto(path);
    await expect(trigger(page, key)).toHaveCount(1);
    // Route-owned map/area/point reads are legitimate initialization, not
    // requests caused by opening static help. Let those settle first.
    await page.waitForLoadState("networkidle", { timeout: 12_000 });
    const before = [...fixture.counts.entries()].sort();
    await trigger(page, key).click();
    const dialog = page.getByRole("dialog", { name: contextHelpRegistry[key].en.title });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(contextHelpRegistry[key].en.body);
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    expect([...fixture.counts.entries()].sort()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath(group + "-en-light-help.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger(page, key)).toBeFocused();
    expect(writes).toEqual([]);
  }
});

test("Operations help uses current RTL locale without changing selection or requests", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path.endsWith("/overview/live-sessions")
      ? { body: { items: [{ ...sessionItem(), checkedInBy: null, parkedBy: null,
        parkingCompletionProof: "NO_RECORD" }], nextCursor: null } }
      : operationsReadReply(path),
  });
  await fixture.install(page);
  await enterManager(page, "/vehicles");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const key = "vehicles.page";
  const help = page.getByRole("button", { name: "مساعدة: " + contextHelpRegistry[key].ar.title });
  await help.click();
  await expect(page.getByRole("dialog", { name: contextHelpRegistry[key].ar.title }))
    .toContainText(contextHelpRegistry[key].ar.body);
  await expect(page.getByRole("button", { name: "إغلاق" })).toBeVisible();
});

test("unauthorized operational routes do not reveal help controls or catalogs", async ({ page }) => {
  const fixture = new DashboardApiFixture({ operationalContexts: [supervisorContext()] });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await expect(trigger(page, "vehicles.page")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Help:/ })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("static Operations section manifest contains the expected 19 exact keys", () => {
  const actual = routes.flatMap(({ group }) => helpSectionManifest[group]);
  expect(actual).toHaveLength(19);
  expect(new Set(actual).size).toBe(19);
});

test("Operations mounts 19 section keys at authorized actual sections and nested drawers", async ({ page }) => {
  page.setDefaultTimeout(8_000);
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path.endsWith("/overview/live-sessions")
      ? { body: { items: [{ ...sessionItem(), checkedInBy: null, parkedBy: null,
        parkingCompletionProof: "NO_RECORD" }], nextCursor: null } }
      : operationsReadReply(path),
  });
  await fixture.install(page);
  await enterManager(page, "/live-operations");

  async function assertHelp(key: ContextHelpKey) {
    await expect(trigger(page, key)).toBeVisible();
    await trigger(page, key).click();
    const dialog = page.getByRole("dialog", { name: contextHelpRegistry[key].en.title });
    await expect(dialog).toContainText(contextHelpRegistry[key].en.body);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }

  await assertHelp("live.kpis");
  await assertHelp("live.sessions");
  await page.getByRole("button", { name: /^Details:/ }).first().click();
  await assertHelp("live.sessionDetail");
  await expect(page.getByRole("dialog", { name: "Details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Retrieval Queue" }).click();
  await assertHelp("live.retrieval");
  await expect(trigger(page, "live.sessions")).toHaveCount(0);

  await page.goto("/vehicles");
  await assertHelp("vehicles.search");
  await assertHelp("vehicles.table");
  await page.getByRole("button", { name: /^Details:/ }).first().click();
  await assertHelp("vehicles.drawer");
  await expect(page.getByRole("dialog", { name: "Details" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/tasks");
  await assertHelp("tasks.filters");
  await assertHelp("tasks.table");
  await page.getByRole("button", { name: /^Details:/ }).first().click();
  await assertHelp("tasks.drawer");
  await expect(page.getByRole("dialog", { name: "Details" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/maps-zones");
  await assertHelp("maps.mode");
  await assertHelp("maps.live");
  await assertHelp("maps.legend");
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
  await assertHelp("maps.setup");
  await expect(trigger(page, "maps.live")).toHaveCount(0);

  await page.goto("/keys");
  await assertHelp("keys.operational");
  await page.getByRole("tab", { name: "Physical Resources" }).click();
  await assertHelp("keys.configuration");
  await page.getByRole("button", { name: /Add Key Slot/i }).click();
  await assertHelp("keys.resourceDetails");
  await expect(page.getByRole("dialog", { name: /Add Key Slot/i })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/incidents");
  await assertHelp("incidents.list");
  await page.getByRole("button", { name: /^Details:/ }).first().click();
  await assertHelp("incidents.detail");
  await expect(page.getByRole("dialog", { name: /^Details:/ })).toBeVisible();
  await page.keyboard.press("Escape");
});
