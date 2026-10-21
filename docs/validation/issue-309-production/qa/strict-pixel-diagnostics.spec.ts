import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { installPhotoScenario, openPhotos, type PhotoScenario } from "./photo-scenario-fixture";

// Measure the real React build and unchanged approved HTML without changing
// the original Dashboard or approved HTML source.
const approved = resolve(__dirname, "../../../../../issue-309-photo-viewer-prototype/docs/validation/issue-309-prototype/issue-309-photo-viewer.html");
const output = resolve(__dirname, "results/strict-pixel-diagnostics");
const jpeg = readFileSync(resolve(__dirname, "synthetic-photo.jpg")).toString("base64");
const sha256 = "0b1900896b46af9d1f11dd88f01643978629001cb1c956de5f1e7f5987cdbd74";

function setControl(page: Page, selector: string, value: string) {
  return page.locator(selector).evaluate((node, next) => {
    const control = node as HTMLSelectElement;
    control.value = next;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

function coordinates(page: Page, html: boolean) {
  return page.evaluate((mock) => {
    const root = document.querySelector(mock ? "#photoSection" : '[class*="photoSection"]');
    const viewer = document.querySelector(mock ? "#viewer" : '[class*="viewerBackdrop"] [role="dialog"]');
    const choose = (name: string) => name === "section" ? root :
      name === "glyph" ? root?.querySelector(mock ? ".stateGlyph" : '[class*="stateGlyph"]') :
      name === "meta" ? root?.querySelector(mock ? ".tileCaption small" : '[class*="tileCaption"] small') :
      name === "heading" ? root?.querySelector("h3") :
      name === "viewer" ? viewer :
      name === "viewerTitle" ? viewer?.querySelector("h2") :
      name === "viewerClose" ? viewer?.querySelector(mock ? "#closeViewer" : '[class*="viewerClose"]') : null;
    const items: Record<string, unknown> = {};
    for (const name of ["section", "glyph", "meta", "heading", "viewer", "viewerTitle", "viewerClose"]) {
      const node = choose(name);
      if (!node) continue;
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      items[name] = {
        absolute: [rect.x, rect.y, rect.width, rect.height].map((n) => +n.toFixed(4)),
        text: node.textContent, font: style.font, fontFamily: style.fontFamily,
        fontWeight: style.fontWeight, lineHeight: style.lineHeight, outline: style.outline,
      };
    }
    return {
      items, dpr: devicePixelRatio, zoom: visualViewport?.scale ?? 1,
      lang: document.documentElement.lang, dir: document.documentElement.dir,
      theme: document.documentElement.getAttribute("data-theme"),
      fontReady: document.fonts.status, interLoaded: document.fonts.check('12px Inter'),
      ua: navigator.userAgent,
    };
  }, html);
}

test.beforeAll(() => {
  expect(createHash("sha256").update(readFileSync(approved)).digest("hex")).toBe(sha256);
  mkdirSync(output, { recursive: true });
});

for (const state of ["empty", "three", "network", "viewer"] as const satisfies readonly PhotoScenario[]) {
  test("immutable photo vs React paint forensic: " + state, async ({ page, context }) => {
    const html = await context.newPage();
    const { setup } = installPhotoScenario(page, state);
    await setup();
    await page.setViewportSize({ width: 390, height: 900 });
    await html.setViewportSize({ width: 390, height: 900 });
    await openPhotos(page, "vehicles");
    await html.goto(pathToFileURL(approved).href);
    await setControl(html, "#surface", "vehicles");
    await setControl(html, "#photoState", state === "network" ? "error" : state);
    await setControl(html, "#theme", "light");
    await setControl(html, "#locale", "en");
    // The helper intentionally starts the default desktop fixture and resets
    // its viewport. Pin the *actual* viewports after it finishes.
    await page.setViewportSize({ width: 390, height: 900 });
    await html.setViewportSize({ width: 390, height: 900 });
    await page.locator('[class*="photoSection"]').scrollIntoViewIfNeeded();
    await html.locator("#photoSection").scrollIntoViewIfNeeded();
    if (state === "three" || state === "viewer") {
      const captions = await page.locator('[class*="photoTile"] [class*="tileCaption"]').evaluateAll((els) =>
        els.map((el) => [el.querySelector("strong")?.textContent, el.querySelector("small")?.textContent]));
      await html.evaluate(({ photo, captions }) => {
        document.querySelectorAll("#photoSection .photoTile").forEach((node, i) => {
          const img = node.querySelector("img");
          if (img) img.src = "data:image/jpeg;base64," + photo;
          const title = node.querySelector("strong"), meta = node.querySelector("small");
          if (title) title.textContent = captions[i]?.[0] ?? title.textContent;
          if (meta) meta.textContent = captions[i]?.[1] ?? meta.textContent;
        });
      }, { photo: jpeg, captions });
      await html.locator("#photoSection .photoTile img").first().evaluate((image: HTMLImageElement) => image.decode());
    }
    if (state === "network") {
      // The immutable DEMO alone says "Retry demo". Normalize *test DOM only*.
      await html.locator("#photoSection .photoMessage button").evaluate((button) => button.textContent = "Retry");
    }
    if (state === "viewer") {
      const trigger = page.locator('[class*="photoTile"]').first();
      await trigger.focus(); await page.keyboard.press("Enter");
      if (await html.locator("#viewerBackdrop").getAttribute("hidden") !== null) {
        await html.locator("#photoSection .photoTile").first().click();
      }
      const footer = await page.locator('[class*="viewerFooter"]').evaluate((element) => ({
        title: element.querySelector("strong")?.textContent ?? "",
        meta: element.querySelector("span")?.textContent ?? "",
        hint: element.querySelector("span:last-child")?.textContent ?? "",
      }));
      await html.evaluate(({ footer, photo }) => {
        const values = { viewerDescription: footer.title, viewerMeta: footer.meta, viewerHint: footer.hint };
        for (const [id, value] of Object.entries(values)) {
          const node = document.getElementById(id); if (node) node.textContent = value;
        }
        const img = document.querySelector<HTMLImageElement>("#viewerImage");
        if (img) img.src = "data:image/jpeg;base64," + photo;
      }, { footer, photo: jpeg });
    }
    await Promise.all([page.evaluate(() => document.fonts.ready), html.evaluate(() => document.fonts.ready)]);
    await page.mouse.move(0, 0); await html.mouse.move(0, 0);
    const actual = await coordinates(page, false), expected = await coordinates(html, true);
    const targetReact = page.locator(state === "viewer" ? '[class*="viewerBackdrop"] [role="dialog"]' : '[class*="photoSection"]');
    const targetHtml = html.locator(state === "viewer" ? "#viewer" : "#photoSection");
    for (const [tag, locator] of [["react", targetReact], ["html", targetHtml]] as const) {
      for (let repeat = 0; repeat < 2; repeat++) {
        await locator.screenshot({ path: resolve(output, state + "-" + tag + "-" + repeat + ".png"), animations: "disabled" });
      }
    }
    if (state === "empty" || state === "three") {
      // Test a DOM-only hypothesis; never change real React source until a
      // measured improvement is reproducible. Approved HTML stays immutable.
      await page.evaluate((phase) => {
        const root = document.querySelector('[class*="photoSection"]');
        if (phase === "empty") {
          const span = root?.querySelector('[class*="stateGlyph"]');
          if (span) {
            const replacement = document.createElement("div");
            replacement.className = span.className;
            replacement.setAttribute("aria-hidden", "true");
            replacement.textContent = span.textContent;
            span.replaceWith(replacement);
          }
        } else {
          root?.querySelectorAll('[class*="tileCaption"] small').forEach((node) => {
            node.textContent = node.textContent;
          });
        }
      }, state);
      await targetReact.screenshot({ path: resolve(output, state + "-react-normalized.png"), animations: "disabled" });
    }
    writeFileSync(resolve(output, state + ".json"), JSON.stringify({ state, actual, expected, designHash: sha256 }, null, 2));
    await html.close();
  });
}
