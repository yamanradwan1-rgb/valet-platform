import { expect, test, chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PresenceFixture } from "./support/presence-fixtures";
import { mockPresenceMap } from "./support/presence-map-mock";

const evidence = resolve(__dirname, "../../../tmp/issue-280-w7-qa");
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3003";

test("actual Chromium browser zoom 200% is usable and accessible at 720/384 CSS px", async () => {
  test.setTimeout(150_000);
  const scratch = mkdtempSync(join(tmpdir(), "issue280-realzoom-"));
  const extension = join(scratch, "extension");
  mkdirSync(extension);
  writeFileSync(
    join(extension, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Issue 280 real browser zoom QA",
      version: "1.0",
      permissions: ["tabs"],
      background: { service_worker: "service.js" },
    }),
  );
  writeFileSync(
    join(extension, "service.js"),
    "chrome.runtime.onInstalled.addListener(() => {});",
  );
  const context = await chromium.launchPersistentContext(
    join(scratch, "profile"),
    {
      channel: "chromium",
      headless: true,
      baseURL,
      viewport: { width: 1440, height: 900 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  const measurements: Record<string, unknown>[] = [];
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    for (const sample of [
      { width: 1440, lang: "en", theme: "light" },
      { width: 768, lang: "ar", theme: "dark" },
    ]) {
      await page.setViewportSize({ width: sample.width, height: 900 });
      await mockPresenceMap(page);
      const fixture = new PresenceFixture("LM");
      await fixture.open(page);
      await page.evaluate(
        ({ lang, theme }) => {
          localStorage.setItem("vaylet_dashboard_locale", lang);
          localStorage.setItem("vaylet_dashboard_theme", theme);
          dispatchEvent(new Event("vaylet-dashboard-locale-change"));
          dispatchEvent(new Event("vaylet-dashboard-theme-change"));
        },
        sample,
      );
      const section = page.getByTestId("shift-presence");
      await expect(section).toBeVisible();
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
        const content = document.querySelector<HTMLElement>(".shell-main");
        return {
          dpr: devicePixelRatio,
          viewportWidth: innerWidth,
          physicalWidth: outerWidth,
          visualScale: visualViewport.scale,
          pageScroll: root.scrollWidth,
          pageClient: root.clientWidth,
          contentScroll: content?.scrollWidth ?? null,
          contentClient: content?.clientWidth ?? null,
        };
      });
      const nodes = await cdp.send("Accessibility.getFullAXTree");
      const controls = new Set([
        "button", "checkbox", "combobox", "link",
        "radio", "searchbox", "spinbutton", "textbox",
      ]);
      const unnamed = nodes.nodes.filter(
        (node) =>
          !node.ignored &&
          controls.has(node.role?.value ?? "") &&
          !(node.name?.value ?? "").trim(),
      );
      const id = `${sample.lang}-${sample.theme}-${sample.width}`;
      measurements.push({ id, zoom, layout, unnamed: unnamed.length });
      mkdirSync(join(evidence, "zoom"), { recursive: true });
      await page.screenshot({
        path: join(evidence, "zoom", `${id}-browser200.png`),
        animations: "disabled",
      });
      expect(zoom).toBe(2);
      expect(layout.dpr).toBe(2);
      expect(layout.viewportWidth).toBe(sample.width / 2);
      expect(layout.visualScale).toBe(1);
      expect(layout.pageScroll).toBeLessThanOrEqual(layout.pageClient + 1);
      expect(layout.contentScroll).toBeLessThanOrEqual(
        (layout.contentClient ?? 0) + 1,
      );
      expect(unnamed).toHaveLength(0);
      expect(fixture.writes).toEqual([]);
      await worker.evaluate((id) => chrome.tabs.setZoom(id, 1), tabId!);
    }
  } finally {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(
      join(evidence, "real-browser-zoom.json"),
      JSON.stringify({ method: "chrome.tabs.setZoom(2)", measurements }, null, 2),
    );
    await context.close();
  }
});
