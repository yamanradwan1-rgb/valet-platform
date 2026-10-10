import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { locationIntelligenceReply } from "./support/md05-intelligence-fixtures";
import { operationsReadReply, sessionItem } from "./support/operations-fixtures";
import { contextHelpRegistry } from "../src/features/help/context-help-registry";

async function enter(page: Page, route: string) {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path.endsWith("/overview/live-sessions")
      ? { body: { items: [{ ...sessionItem(), checkedInBy: null, parkedBy: null,
        parkingCompletionProof: "NO_RECORD" }], nextCursor: null } }
      : operationsReadReply(path) ?? locationIntelligenceReply(path, request),
  });
  await fixture.install(page);
  await page.goto(route);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  return fixture;
}

for (const [route, key] of [
  ["/analytics", "analytics.page"],
  ["/overview", "overview.page"],
  ["/payments", "payments.page"],
  ["/maps-zones", "maps.page"],
] as const) {
  test(route + " real Chromium page-scale 200% keeps Help keyboard accessible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    const fixture = await enter(page, route);
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await expect.poll(() => page.evaluate(() => window.visualViewport?.scale)).toBe(2);
    const trigger = page.getByRole("button", { name: "Help: " + contextHelpRegistry[key].en.title });
    await trigger.focus();
    const before = [...fixture.counts.entries()].sort();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: contextHelpRegistry[key].en.title });
    await expect(dialog).toContainText(contextHelpRegistry[key].en.body);
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    const folder = resolve(process.cwd(), "../../tmp/issue-278-c-historical-evidence/after/native-page-scale-200");
    mkdirSync(folder, { recursive: true });
    await page.screenshot({
      path: join(folder, key.replace(".", "-") + "-390px-200pct.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect([...fixture.counts.entries()].sort()).toEqual(before);
    await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    await client.detach();
  });
}

test("narrow RTL browser layout at 200% CSS zoom preserves help focus and records overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const fixture = await enter(page, "/analytics");
  await page.getByRole("button", { name: "Language" }).click();
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  const { effectiveWidth, buttonWidth } = await page.evaluate(() => {
    const help = document.querySelector<HTMLElement>('button[aria-label^="مساعدة: التحليلات"]')!;
    return {
      effectiveWidth: document.documentElement.clientWidth,
      buttonWidth: help.getBoundingClientRect().width,
    };
  });
  expect(effectiveWidth).toBeGreaterThan(0);
  expect(buttonWidth).toBeGreaterThanOrEqual(24);
  const trigger = page.getByRole("button", {
    name: "مساعدة: " + contextHelpRegistry["analytics.page"].ar.title,
  });
  const before = [...fixture.counts.entries()].sort();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: contextHelpRegistry["analytics.page"].ar.title });
  await expect(dialog).toContainText(contextHelpRegistry["analytics.page"].ar.body);
  const folder = resolve(process.cwd(), "../../tmp/issue-278-c-historical-evidence/after/css-layout-zoom-200");
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, "analytics-rtl-390px.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect([...fixture.counts.entries()].sort()).toEqual(before);
});
