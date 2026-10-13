import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserServer, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ordinarySettingHelpKeys } from "./help-setting-manifest";
import { legacyLocationKeys, settingDefinitions } from "../administration/settings/setting-definitions";

const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", {
  paths: [require.resolve("vitest")],
})) as { build: (options: object) => Promise<{ outputFiles: { text: string }[] }> };
const base = new URL("./", import.meta.url);
const source = (name: string) => readFileSync(fileURLToPath(new URL(name, base)), "utf8");
const css = [
  source("../../styles/shell.css"),
  source("context-help.module.css").replace(/:global\(([^)]+)\)/g, "$1"),
  ":root { --text:#111; --surface:#fff; --border:#888; --shadow:0 2px 5px #333; }",
  "table { border-collapse:collapse; width:100%; } td { border:1px solid #aaa;padding:8px; }",
  ".actions { display:flex; gap:8px; align-items:center; } .trigger { flex:0 0 auto; }",
].join("\n");

let browser: Browser;
let browserServer: BrowserServer;
let page: Page;
let script: string;

describe("278-D Administration settings mounted help", () => {
  beforeAll(async () => {
    const bundled = await build({
      entryPoints: [fileURLToPath(new URL("administration-settings-help-browser-harness.tsx", base))],
      bundle: true,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      write: false,
      target: "es2022",
      plugins: [{
        name: "isolated-owned-scope",
        setup(compiler: {
          onResolve: (arg: { filter: RegExp }, cb: (arg: { path: string }) => object | undefined) => void;
          onLoad: (arg: { filter: RegExp; namespace?: string }, cb: (arg: { path: string }) => object) => void;
        }) {
          compiler.onResolve({ filter: /protected-dashboard-context$|selected-scope-revalidation-policy$|locale-provider$/ },
            ({ path }) => ({ path, namespace: "isolated-scope" }));
          compiler.onLoad({ filter: /.*/, namespace: "isolated-scope" }, ({ path }) => ({
            contents: path.includes("locale-provider")
              ? 'export function useDashboardLocale(){return { locale:"en" };}'
              : path.includes("revalidation")
                ? 'export function selectedScopeAuthorityKey(){return "company:fixture";}'
                : 'export function useProtectedDashboard(){return {identityGeneration:1,sessionGeneration:1,selectionRevision:1,selectedScope:{authority:"COMPANY_ADMIN"}};}',
            loader: "js",
          }));
          compiler.onLoad({ filter: /\.module\.css$/ }, () => ({
            contents: "export default new Proxy({}, {get: (_target, name) => String(name)});",
            loader: "js",
          }));
        },
      }],
    });
    script = bundled.outputFiles[0]!.text;
    browserServer = await chromium.launchServer({ headless: true });
    browser = await chromium.connect(browserServer.wsEndpoint());
  }, 45_000);

  afterAll(async () => {
    await page?.context().close();
    await browser?.close();
    await browserServer?.kill();
  }, 90_000);

  async function mount() {
    await page?.context().close();
    page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
    await page.setContent("<!doctype html><html><body><div id='root'></div></body></html>");
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });
    await page.locator('[data-context="company"] tr[data-setting]').first().waitFor();
  }

  it("matches all actual company, management-location and LM keys to one Save-adjacent help", async () => {
    await mount();
    const contexts = { company: 15, override: 15, manager: 10 } as const;
    for (const [context, expected] of Object.entries(contexts)) {
      const rows = page.locator('[data-context="' + context + '"] tr[data-setting]');
      const actualRows = context === "company" ? 16 : context === "override" ? 17 : 10;
      expect(await rows.count()).toBe(actualRows);
      const keys = settingDefinitions
        .filter(({ key }) => context !== "manager" || legacyLocationKeys.has(key))
        .map(({ key }) => key);
      expect(keys).toHaveLength(expected);
      for (const key of keys) {
        const row = rows.filter({ has: page.locator('[data-setting="' + key + '"]') });
        // Match the exact row, rather than a translated label or nth() index.
        const exact = page.locator('[data-context="' + context + '"] tr[data-setting="' + key + '"]');
        expect(await exact.count()).toBe(1);
        const help = exact.locator('button[aria-label^="Help:"]');
        expect(await help.count()).toBe(1);
        expect(await help.getAttribute("type")).toBe("button");
        expect(await help.evaluate((button) =>
          button.previousElementSibling?.textContent?.trim())).toBe("Save");
        expect(ordinarySettingHelpKeys[key as keyof typeof ordinarySettingHelpKeys]).toBe("setting." + key);
        void row;
      }
    }
    for (const context of ["company", "override"]) {
      const hours = page.locator('[data-context="' + context + '"] tr[data-setting="operatingHours"]');
      expect(await hours.locator('button[aria-label^="Help:"]').count()).toBe(1);
      expect(await hours.locator('button[aria-label^="Help:"]').evaluate((node) =>
        node.previousElementSibling?.textContent?.trim())).toBe("Save");
    }
    const sla = page.locator('[data-context="override"] tr[data-setting="slaTargetSeconds"]');
    expect(await sla.locator('button[aria-label^="Help:"]').count()).toBe(1);
  }, 45_000);

  it("preserves modified ordinary draft and makes zero mutation or network requests", async () => {
    await mount();
    const row = page.locator('[data-context="override"] tr[data-setting="checkInPhotosRequired"]');
    await row.locator("select").selectOption("true");
    const save = row.getByRole("button", { name: "Save" });
    expect(await save.isEnabled()).toBe(true);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await row.getByRole("button", { name: /^Help:/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    expect(await row.locator("select").inputValue()).toBe("true");
    expect(await save.isEnabled()).toBe(true);
    expect(await page.evaluate(() => window.settingHelpMutations)).toEqual({ save: 0, clear: 0 });
    expect(requests).toEqual([]);
  });

  it("keeps seven Operating Hours drafts and invalid SLA disabled after opening help", async () => {
    await mount();
    const hours = page.locator('[data-context="company"] tr[data-setting="operatingHours"]');
    await hours.locator("select").first().selectOption("OPEN");
    await hours.locator('input[type="time"]').first().fill("06:30");
    const before = await hours.locator("select").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLSelectElement).value));
    await hours.getByRole("button", { name: /^Help:/ }).click();
    await page.keyboard.press("Escape");
    expect(await hours.locator("select").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLSelectElement).value))).toEqual(before);
    expect(await hours.locator('input[type="time"]').first().inputValue()).toBe("06:30");
    const sla = page.locator('[data-context="override"] tr[data-setting="slaTargetSeconds"]');
    await sla.locator('input[type="number"]').fill("20");
    expect(await sla.getByRole("button", { name: "Save" }).isDisabled()).toBe(true);
    await sla.getByRole("button", { name: /^Help:/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    expect(await sla.locator('input[type="number"]').inputValue()).toBe("20");
    expect(await sla.getByRole("button", { name: "Save" }).isDisabled()).toBe(true);
    expect(await page.evaluate(() => window.settingHelpMutations)).toEqual({ save: 0, clear: 0 });
  });
});
