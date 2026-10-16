import { expect, chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { PresenceFixture } from "./support/presence-fixtures";
import { mockIssue280Map } from "./issue280-map-first-map-mock";

const evidence = resolve(__dirname, "../../../tmp/issue-280-rem-w7-qa/zoom");

/** Real browser-level zoom; unlike CSS viewport simulations, asserts getZoom(). */
export async function checkGuidedBrowserZoom() {
  const scratch = mkdtempSync(join(tmpdir(), "issue280-guided-zoom-"));
  const extension = join(scratch, "extension");
  mkdirSync(extension);
  writeFileSync(join(extension, "manifest.json"), JSON.stringify({
    manifest_version: 3, name: "Guided presence true 200% QA",
    version: "1.0", permissions: ["tabs"],
    background: { service_worker: "service.js" },
  }));
  writeFileSync(join(extension, "service.js"),
    "chrome.runtime.onInstalled.addListener(() => {});");
  const context = await chromium.launchPersistentContext(join(scratch, "profile"), {
    channel: "chromium", headless: true,
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3003",
    viewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const measurements: Record<string, unknown>[] = [];
  try {
    const worker = context.serviceWorkers()[0] ??
      await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    for (const sample of [
      { width: 1440, locale: "en", theme: "light" },
      { width: 768, locale: "ar", theme: "dark" },
    ] as const) {
      if (page.url().includes("/policies")) {
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await context.clearCookies();
      }
      await page.setViewportSize({ width: sample.width, height: 900 });
      await mockIssue280Map(page);
      const fixture = new PresenceFixture("LM");
      await fixture.open(page);
      await page.getByTestId("presence-view-setup").click();
      const steps = page.getByTestId("presence-setup-steps");
      await steps.getByRole("navigation").getByRole("button").nth(2).click();
      const startSource = page.getByTestId("presence-inheritance-shiftStartPresenceMode");
      await expect(startSource).toHaveAccessibleName(/source/i);
      await startSource.selectOption("CUSTOM");
      await page.locator('[data-presence-field="shiftStartPresenceMode"]')
        .getByRole("combobox").last().selectOption("WARN_ONLY");
      await page.evaluate(({ locale, theme }) => {
        localStorage.setItem("vaylet_dashboard_locale", locale);
        localStorage.setItem("vaylet_dashboard_theme", theme);
        dispatchEvent(new Event("vaylet-dashboard-locale-change"));
        dispatchEvent(new Event("vaylet-dashboard-theme-change"));
      }, sample);
      await steps.getByRole("navigation").getByRole("button").nth(3).click();
      await expect(page.getByTestId("presence-setup-review")).toBeVisible();
      expect(fixture.writes).toEqual([]);
      const tabId = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.find((tab) => tab.url?.includes("/policies"))?.id ?? null;
      });
      expect(tabId).not.toBeNull();
      const zoom = await worker.evaluate(async (id) => {
        await chrome.tabs.setZoom(id, 2);
        return chrome.tabs.getZoom(id);
      }, tabId!);
      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const shell = document.querySelector<HTMLElement>(".shell-main");
        return {
          dpr: devicePixelRatio, cssWidth: innerWidth,
          visualScale: visualViewport?.scale ?? 0,
          rootScroll: root.scrollWidth, rootClient: root.clientWidth,
          shellScroll: shell?.scrollWidth ?? 0, shellClient: shell?.clientWidth ?? 0,
        };
      });
      const tree = await cdp.send("Accessibility.getFullAXTree");
      const unnamedGlobalButtons = tree.nodes.filter((node) =>
        !node.ignored && node.role?.value === "button" &&
        !(node.name?.value ?? "").trim()).length;
      measurements.push({
        id: `${sample.locale}-${sample.theme}-${sample.width}`,
        zoom, layout, unnamedGlobalButtons,
        note: "Global AX failures disclosed; original strict zoom suite remains untouched",
      });
      await expect(page.getByTestId("presence-setup-review")).toBeVisible();
      await expect(page.getByTestId("presence-inheritance-shiftStartPresenceMode"))
        .toHaveCount(0);
      expect(zoom).toBe(2);
      expect(layout.dpr).toBe(2);
      expect(layout.cssWidth).toBe(sample.width / 2);
      expect(layout.visualScale).toBe(1);
      expect(layout.rootScroll).toBeLessThanOrEqual(layout.rootClient + 1);
      expect(layout.shellScroll).toBeLessThanOrEqual(layout.shellClient + 1);
      expect(fixture.writes).toEqual([]);
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({
        path: join(evidence, `${sample.locale}-${sample.theme}-${sample.width}-real200.png`),
        animations: "disabled",
      });
      await worker.evaluate((id) => chrome.tabs.setZoom(id, 1), tabId!);
    }
  } finally {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, "guided-real-browser-zoom.json"),
      JSON.stringify({ method: "chrome.tabs.setZoom(2)", measurements }, null, 2));
    await context.close();
  }
}
