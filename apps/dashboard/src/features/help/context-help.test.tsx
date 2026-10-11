import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const esbuildPath = nodeRequire.resolve("esbuild", {
  paths: [nodeRequire.resolve("vitest")],
});
type BundleOutput = { outputFiles: readonly { text: string }[] };
type CssPlugin = {
  onLoad: (
    options: { filter: RegExp },
    callback: () => { contents: string; loader: "js" },
  ) => void;
};
const { build } = nodeRequire(esbuildPath) as {
  build: (options: object) => Promise<BundleOutput>;
};

let browser: Browser;
let page: Page;
let browserScript: string;
const styles = [
  readFileSync(fileURLToPath(new URL("../../styles/shell.css", import.meta.url)), "utf8"),
  readFileSync(fileURLToPath(new URL("./context-help.module.css", import.meta.url)), "utf8")
    .replace(/:global\(([^)]+)\)/g, "$1"),
  ":root { --text: #111; --surface: #fff; --border: #555; --shadow: 0 1px 3px #555; }",
].join("\n");

async function openHelp() {
  await page.locator('button[aria-label^="Help:"], button[aria-label^="مساعدة:"]').first().click();
  await page.getByRole("dialog").last().waitFor({ state: "visible" });
}

async function clickHarness(control: string) {
  // Auth/route changes are emitted by the owning shell even under a modal.
  await page.evaluate((name) => {
    (document.querySelector('[data-test="' + name + '"]') as HTMLButtonElement)?.click();
  }, control);
}

async function counters() {
  return page.evaluate(() => (window as Window & {
    helpCounters: { submit: number; request: number; geolocation: number; parentClose: number };
  }).helpCounters);
}

describe("ContextHelp real-browser mounted accessibility and lifecycle", () => {
  beforeAll(async () => {
    const compiled = await build({
      entryPoints: [fileURLToPath(new URL("./context-help-browser-harness.tsx", import.meta.url))],
      bundle: true,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      write: false,
      target: "es2022",
      plugins: [{
        name: "css-module-for-isolated-browser-mount",
        setup(compiler: CssPlugin) {
          compiler.onLoad({ filter: /context-help\.module\.css$/ }, () => ({
            contents: 'export default { trigger: "trigger", dialogHost: "dialogHost", content: "content", title: "title", body: "body", actions: "actions", close: "close" };',
            loader: "js",
          }));
        },
      }],
    });
    browserScript = compiled.outputFiles[0]!.text;
    browser = await chromium.launch({ headless: true });
  }, 40_000);

  beforeEach(async () => {
    const context = await browser.newContext({ viewport: { width: 1100, height: 780 } });
    page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setContent("<!doctype html><html lang='en'><body><div id='root'></div></body></html>");
    await page.addStyleTag({ content: styles });
    await page.addScriptTag({ content: browserScript });
    await page.waitForTimeout(150);
    if (await page.locator('button[aria-label^="Help:"]').count() === 0) {
      throw new Error("Harness mounted no ContextHelp trigger: " +
        errors.join("; ") + " / HTML: " +
        (await page.locator("#root").innerHTML()).slice(0, 600) +
        " / Bundle prefix: " + browserScript.slice(0, 100));
    }
  }, 25_000);

  afterEach(async () => {
    await page?.context().close();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("mounts exactly the requested English key, a named icon button and correct dialog semantics", async () => {
    const trigger = page.getByRole("button", { name: "Help: Raw GPS retention days" });
    expect(await trigger.getAttribute("type")).toBe("button");
    expect(await trigger.locator('svg[aria-hidden="true"]').count()).toBe(1);
    const bounds = await trigger.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(24);
    expect(bounds!.height).toBeGreaterThanOrEqual(24);
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Raw GPS retention days" });
    expect(await dialog.isVisible()).toBe(true);
    expect(await dialog.getAttribute("aria-modal")).toBe("true");
    expect(await dialog.getByRole("heading", { name: "Raw GPS retention days" }).count()).toBe(1);
    expect(await dialog.textContent()).toContain("task-scoped GPS records");
    expect(await page.locator("[role=dialog]").count()).toBe(1);
    expect(await dialog.getByRole("button", { name: "Close" }).evaluate((el) =>
      el === document.activeElement)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await dialog.getByRole("button", { name: "Close" }).evaluate((el) =>
      el === document.activeElement)).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.getByRole("button", { name: "Close" }).evaluate((el) =>
      el === document.activeElement)).toBe(true);
    expect(await page.locator('body > [role="dialog"]').count()).toBe(0);
    expect(await page.locator("a[href]").count()).toBe(0);
  });

  it("supports Arabic, RTL, localized name and updates both title and body while open", async () => {
    await clickHarness("arabic");
    const trigger = page.getByRole("button", { name: "مساعدة: أيام الاحتفاظ ببيانات GPS" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    expect(await dialog.getAttribute("lang")).toBeNull();
    expect(await dialog.locator('[lang="ar"][dir="rtl"]').count()).toBeGreaterThan(0);
    expect(await dialog.textContent()).toContain("بيانات GPS الخام");
    expect(await dialog.getByRole("button", { name: "إغلاق" }).count()).toBe(1);
    await clickHarness("english");
    expect(await page.getByRole("dialog", { name: "Raw GPS retention days" }).isVisible()).toBe(true);
    expect(await page.getByRole("dialog").textContent()).toContain("task-scoped GPS records");
    expect(await page.getByRole("dialog").textContent()).not.toContain("بيانات GPS الخام");
    expect(await page.getByRole("button", { name: "Close" }).count()).toBe(1);
  });

  it("closes on Close, Escape, backdrop but not inside clicks; returns focus without double dialogs", async () => {
    await openHelp();
    await page.getByRole("dialog").locator("p").click();
    expect(await page.getByRole("dialog").count()).toBe(1);
    await page.getByRole("button", { name: "Close" }).click();
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(await page.getByRole("button", { name: "Help: Raw GPS retention days" })
      .evaluate((el) => el === document.activeElement)).toBe(true);
    await page.keyboard.press("Space");
    expect(await page.getByRole("dialog").count()).toBe(1);
    await page.keyboard.press("Escape");
    expect(await page.getByRole("dialog").count()).toBe(0);
    await openHelp();
    await page.locator(".dialog-backdrop").click({ position: { x: 2, y: 2 } });
    expect(await page.getByRole("dialog").count()).toBe(0);
    await page.locator('button[aria-label^="Help:"]').first().evaluate((el) => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(await page.getByRole("dialog").count()).toBe(1);
  });

  it("keeps one help dialog across separate triggers, including rapid cross-trigger opening", async () => {
    await openHelp();
    await page.getByRole("button", { name: "Help: Vehicles" }).evaluate((node) => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.getByRole("dialog", { name: "Vehicles" }).waitFor();
    expect(await page.getByRole("dialog").count()).toBe(1);
    expect(await page.getByRole("dialog", { name: "Raw GPS retention days" }).count()).toBe(0);
    await page.getByRole("button", { name: "Help: Raw GPS retention days" }).evaluate((node) => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.getByRole("dialog", { name: "Raw GPS retention days" }).waitFor();
    expect(await page.getByRole("dialog").count()).toBe(1);
  });

  it("keeps the parent dialog and dirty input after nested help Escape", async () => {
    await clickHarness("nested-mode");
    await clickHarness("open-parent");
    const parent = page.getByRole("dialog", { name: "Parent editor" });
    await parent.getByLabel("Parent draft").fill("not saved, stay here");
    await parent.getByRole("button", { name: "Help: Session details" }).click();
    expect(await page.getByRole("dialog").count()).toBe(2);
    expect(await page.getByRole("dialog", { name: "Session details" }).isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.getByRole("dialog").count()).toBe(1);
    expect(await parent.isVisible()).toBe(true);
    expect(await parent.getByLabel("Parent draft").inputValue()).toBe("not saved, stay here");
    expect((await counters()).parentClose).toBe(0);
    expect(await parent.getByRole("button", { name: "Help: Session details" })
      .evaluate((el) => el === document.activeElement)).toBe(true);
  });

  it("renders full-screen help from transformed clipped hosts without dismissing the parent", async () => {
    await page.getByRole("button", { name: "Help: Task list" }).click();
    const dialog = page.getByRole("dialog", { name: "Task list" });
    const rect = await dialog.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(300);
    const backdrop = await page.locator(".dialog-backdrop").last().boundingBox();
    expect(backdrop!.width).toBe(1100);
    expect(backdrop!.height).toBe(780);
    await page.keyboard.press("Escape");

    await clickHarness("nested-mode");
    await clickHarness("open-parent");
    const parent = page.getByRole("dialog", { name: "Parent editor" });
    await parent.getByRole("button", { name: "Help: Session details" }).click();
    const nested = await page.getByRole("dialog", { name: "Session details" }).boundingBox();
    expect(nested!.width).toBeGreaterThanOrEqual(300);
    await page.locator(".dialog-backdrop").last().click({ position: { x: 2, y: 2 } });
    expect(await parent.isVisible()).toBe(true);
    expect(await parent.getByLabel("Parent draft").inputValue()).toBe("parent draft");
    expect((await counters()).parentClose).toBe(0);
  });

  it("closes stale help immediately on identity changes and falls back after route unmount", async () => {
    await openHelp();
    await clickHarness("scope-b");
    expect(await page.getByRole("dialog").count()).toBe(0);
    await clickHarness("scope-a");
    expect(await page.getByRole("dialog").count()).toBe(0);
    await openHelp();
    await clickHarness("unmount");
    await page.waitForFunction(() => document.activeElement?.tagName === "H1");
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(await page.locator('button[aria-label^="Help:"]').count()).toBe(0);
    await clickHarness("mount");
    expect(await page.getByRole("dialog").count()).toBe(0);
  });

  it("keeps focus in the surviving parent modal after nested scope revocation", async () => {
    await clickHarness("nested-mode");
    await clickHarness("open-parent");
    await page.getByRole("dialog", { name: "Parent editor" })
      .getByRole("button", { name: "Help: Session details" }).click();
    await clickHarness("scope-b");
    expect(await page.getByRole("dialog", { name: "Session details" }).count()).toBe(0);
    expect(await page.getByRole("dialog", { name: "Parent editor" }).count()).toBe(1);
    const parent = page.getByRole("dialog", { name: "Parent editor" });
    await page.waitForFunction(() => document.activeElement?.id === "parent-draft");
    await page.keyboard.press("Shift+Tab");
    expect(await parent.getByRole("button", { name: "Close parent" })
      .evaluate((el) => el === document.activeElement)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await parent.getByLabel("Parent draft")
      .evaluate((el) => el === document.activeElement)).toBe(true);
    expect((await counters()).parentClose).toBe(0);
  });

  it("preserves form drafts and has no submission, API, geolocation or navigation effects", async () => {
    await page.getByLabel("Draft").fill("edited and unsaved");
    await openHelp();
    await page.keyboard.press("Escape");
    expect(await page.getByLabel("Draft").inputValue()).toBe("edited and unsaved");
    expect(await counters()).toEqual({
      submit: 0, parentClose: 0, request: 0, geolocation: 0, navigation: 0,
    });
    expect(await page.url()).toContain("about:blank");
  });

  it("keeps long localized text within available small-screen space and theme tokens", async () => {
    await page.setViewportSize({ width: 360, height: 640 });
    await clickHarness("arabic");
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.addStyleTag({ content: '[data-theme="dark"] { --surface:#111; --text:#fff; --border:#aaa; }' });
    await page.getByRole("button", { name: "مساعدة: أيام الاحتفاظ ببيانات GPS" }).click();
    const dialog = page.getByRole("dialog");
    const rect = await dialog.boundingBox();
    expect(rect!.width).toBeLessThanOrEqual(360);
    expect(rect!.height).toBeLessThanOrEqual(640);
    expect(await dialog.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
    expect(await dialog.getByRole("button", { name: "إغلاق" }).isVisible()).toBe(true);
    // A 200%-zoomed 360×640 display exposes roughly half as many CSS pixels.
    // This tests constrained layout, not full browser/assistive-tech approval.
    await page.setViewportSize({ width: 180, height: 320 });
    const enlarged = await dialog.boundingBox();
    expect(enlarged!.width).toBeLessThanOrEqual(180);
    expect(enlarged!.height).toBeLessThanOrEqual(320);
    expect(await dialog.getByRole("button", { name: "إغلاق" }).isVisible()).toBe(true);
  });
});
