import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { initialPhotoCount, installPhotoScenario, openPhotos, type PhotoScenario } from "./photo-scenario-fixture";

/** Compare the immutable approved HTML itself, not an approximation or copied CSS. */
const approved = resolve(__dirname, "../../../../../issue-309-photo-viewer-prototype/docs/validation/issue-309-prototype/issue-309-photo-viewer.html");
const sha256 = "0b1900896b46af9d1f11dd88f01643978629001cb1c956de5f1e7f5987cdbd74";
const output = resolve(__dirname, "results/approved-photo-parity");
const jpegBase64 = readFileSync(resolve(__dirname, "synthetic-photo.jpg")).toString("base64");
const widths = [320, 390, 768, 1440] as const;
const states: readonly PhotoScenario[] = [
  "three", "one", "ten", "empty", "legacy", "unavailable", "loading", "network", "denied", "viewer",
];

type StyleAndGeometry = {
  readonly section: Record<string, string | number>;
  readonly heading: Record<string, string | number> | null;
  readonly count: Record<string, string | number> | null;
  readonly hint: Record<string, string | number> | null;
  readonly grid: Record<string, string | number> | null;
  readonly tile: Record<string, string | number> | null;
  readonly image: Record<string, string | number> | null;
  readonly caption: Record<string, string | number> | null;
  readonly message: Record<string, string | number> | null;
  readonly viewer: Record<string, string | number> | null;
  readonly viewerCanvas: Record<string, string | number> | null;
  readonly viewerImage: Record<string, string | number> | null;
  readonly viewerClose: Record<string, string | number> | null;
};

async function measure(page: Page, html: boolean): Promise<StyleAndGeometry> {
  return await page.evaluate((mode) => {
    const section = document.querySelector(mode ? "#photoSection" : '[class*="photoSection"]');
    if (!section) throw new Error("Missing photo section");
    const pick = (node: Element | null) => {
      if (!node) return null;
      const c = getComputedStyle(node);
      const b = node.getBoundingClientRect();
      const parent = section.parentElement?.getBoundingClientRect();
      const origin = section.getBoundingClientRect();
      return {
        x: +(b.x - (parent?.x ?? 0)).toFixed(2),
        y: +(b.y - (parent?.y ?? 0)).toFixed(2),
        relativeX: +(b.x - origin.x).toFixed(2),
        relativeY: +(b.y - origin.y).toFixed(2),
        width: +b.width.toFixed(2), height: +b.height.toFixed(2),
        display: c.display, color: c.color, backgroundColor: c.backgroundColor,
        borderColor: c.borderTopColor, borderRadius: c.borderTopLeftRadius,
        fontSize: c.fontSize, lineHeight: c.lineHeight, fontFamily: c.fontFamily,
        padding: c.padding, marginTop: c.marginTop, gap: c.gap,
        gridTemplateColumns: c.gridTemplateColumns, aspectRatio: c.aspectRatio,
        objectFit: c.objectFit, boxShadow: c.boxShadow,
        outlineWidth: c.outlineWidth, outlineColor: c.outlineColor, outlineOffset: c.outlineOffset,
      };
    };
    const get = (selector: string) => section.querySelector(selector);
    const viewer = document.querySelector(mode ? "#viewerBackdrop:not([hidden]) #viewer" : '[class*="viewerBackdrop"] [role="dialog"]');
    return {
      section: pick(section)!, heading: pick(get("h3")),
      count: pick(get(mode ? ".photoCount" : '[class*="photoCount"]')),
      hint: pick(get("p")), grid: pick(get(mode ? ".photoGrid" : '[class*="photoGrid"]')),
      tile: pick(get(mode ? ".photoTile" : '[class*="photoTile"]')),
      image: pick(get(mode ? ".photoTile img" : '[class*="photoTile"] img')),
      caption: pick(get(mode ? ".tileCaption" : '[class*="tileCaption"]')),
      message: pick(get(mode ? ".photoMessage" : '[class*="photoMessage"]')),
      viewer: pick(viewer),
      viewerCanvas: pick(viewer?.querySelector(mode ? ".viewerCanvas" : '[class*="viewerCanvas"]') ?? null),
      viewerImage: pick(viewer?.querySelector("img") ?? null),
      viewerClose: pick(viewer?.querySelector(mode ? "#closeViewer" : '[class*="viewerClose"]') ?? null),
    };
  }, html);
}

async function copyActualDataToImmutableDemo(actual: Page, demo: Page, state: string) {
  if (state === "empty") return;
  const captions = await actual.locator('[class*="photoTile"] [class*="tileCaption"]').evaluateAll((elements) =>
    elements.map((element) => ({
      title: element.querySelector("strong")?.textContent ?? "",
      details: element.querySelector("small")?.textContent ?? "",
    })),
  );
  // Only mutate *browser test DOM*, never the owner-approved HTML file.
  await demo.evaluate(({ photo, captions }) => {
    const tiles = Array.from(document.querySelectorAll("#photoSection .photoTile"));
    tiles.forEach((tile, i) => {
      const img = tile.querySelector("img");
      if (img) img.src = `data:image/jpeg;base64,${photo}`;
      const text = tile.querySelector(".tileCaption strong");
      if (text) text.textContent = captions[i]?.title || text.textContent;
      const details = tile.querySelector(".tileCaption small");
      if (details) details.textContent = captions[i]?.details || details.textContent;
    });
  }, { photo: jpegBase64, captions });
  if (state === "viewer") {
    const footer = await actual.locator('[class*="viewerFooter"]').evaluate((element) => ({
      title: element.querySelector("strong")?.textContent ?? "",
      meta: element.querySelector("span")?.textContent ?? "",
      hint: element.querySelector("span:last-child")?.textContent ?? "",
    }));
    await demo.evaluate(({ data, photo }) => {
      const title = document.querySelector("#viewerDescription");
      const meta = document.querySelector("#viewerMeta");
      const hint = document.querySelector("#viewerHint");
      const img = document.querySelector<HTMLImageElement>("#viewerImage");
      if (title) title.textContent = data.title;
      if (meta) meta.textContent = data.meta;
      if (hint) hint.textContent = data.hint;
      if (img) img.src = `data:image/jpeg;base64,${photo}`;
    }, { data: footer, photo: jpegBase64 });
  }
}

async function setApprovedControl(page: Page, selector: string, value: string): Promise<void> {
  // The immutable prototype intentionally hides its demo controls while the
  // drawer is open. Switching the synthetic fixture is a test-only action.
  await page.locator(selector).evaluate((node, next) => {
    const select = node as HTMLSelectElement;
    select.value = next;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test.beforeAll(() => {
  expect(createHash("sha256").update(readFileSync(approved)).digest("hex")).toBe(sha256);
  mkdirSync(output, { recursive: true });
});

for (const surface of ["vehicles", "live-operations"] as const) {
  for (const scenario of states) {
    test(`${surface} immutable HTML vs React ${scenario}: 16 rendered combinations`, async ({ page, context }) => {
      const html = await context.newPage();
      const { setup, releaseLoading } = installPhotoScenario(page, scenario);
      await setup();
      await openPhotos(page, surface);
      await html.goto(pathToFileURL(approved).href);
      const observations: unknown[] = [];
      try {
        for (const variant of [
          { locale: "en", theme: "light" }, { locale: "en", theme: "dark" },
          { locale: "ar", theme: "dark" }, { locale: "ar", theme: "light" },
        ] as const) {
          // React preferences cannot be changed behind a modal backdrop.
          await page.keyboard.press("Escape");
          const themeLabel = variant.locale === "ar" ? (variant.theme === "dark" ? "داكن" : "فاتح") : (variant.theme === "dark" ? "Dark" : "Light");
          const pageLang = await page.locator("html").getAttribute("lang");
          if (pageLang !== variant.locale) await page.getByRole("button", { name: "Language" }).click();
          const currentTheme = await page.locator("html").getAttribute("data-theme");
          if (currentTheme !== variant.theme) await page.getByRole("button", { name: themeLabel, exact: true }).click();
          await page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u }).first().click();
          await setApprovedControl(html, "#surface", surface === "vehicles" ? "vehicles" : "live");
          await setApprovedControl(html, "#photoState", scenario === "network" ? "error" : scenario);
          await setApprovedControl(html, "#locale", variant.locale);
          await setApprovedControl(html, "#theme", variant.theme);
          for (const width of widths) {
            await page.setViewportSize({ width, height: 900 });
            await html.setViewportSize({ width, height: 900 });
            await page.locator('[class*="photoSection"]').scrollIntoViewIfNeeded();
            await html.locator("#photoSection").scrollIntoViewIfNeeded();
            await expect(page.locator('[class*="photoSection"]')).toBeVisible();
            await expect(html.locator("#photoSection")).toBeVisible();
            if (scenario === "viewer") {
              const trigger = page.locator('[class*="photoTile"]').first();
              await trigger.focus();
              await page.keyboard.press("Enter");
              if (await html.locator("#viewerBackdrop").getAttribute("hidden") !== null) {
                await html.locator("#photoSection .photoTile").first().click();
              }
            }
            await copyActualDataToImmutableDemo(page, html, scenario);
            await page.mouse.move(0, 0);
            await html.mouse.move(0, 0);
            if (initialPhotoCount(scenario) > 0) {
              await html.locator("#photoSection .photoTile img").first().evaluate(async (image: HTMLImageElement) => {
                await image.decode();
              });
            }
            await page.evaluate(() => document.fonts.ready);
            await html.evaluate(() => document.fonts.ready);
            const actual = await measure(page, false);
            const expected = await measure(html, true);
            const key = `${surface}-${scenario}-${variant.locale}-${variant.theme}-${width}`;
            const deltas: Record<string, number> = {};
            const mismatched: string[] = [];
            for (const name of ["section", "heading", "count", "hint", "grid", "tile", "image", "caption", "message", "viewer", "viewerCanvas", "viewerImage", "viewerClose"] as const) {
              const a = actual[name], b = expected[name];
              if (!a || !b) {
                if (a !== b) mismatched.push(`${name}:missing`);
                continue;
              }
              for (const prop of ["width", "height", "x", "y", "relativeX", "relativeY"] as const) {
                const d = Math.abs(Number(a[prop]) - Number(b[prop]));
                deltas[`${name}.${prop}`] = +d.toFixed(2);
              }
              for (const prop of ["display", "color", "backgroundColor", "borderColor", "borderRadius", "fontSize", "lineHeight", "padding", "gap", "aspectRatio", "objectFit", "boxShadow", "outlineWidth", "outlineColor", "outlineOffset"] as const) {
                if (a[prop] !== b[prop]) mismatched.push(`${name}.${prop}:${String(b[prop])}->${String(a[prop])}`);
              }
            }
            const saved = { key, expected, actual, deltas, mismatched };
            observations.push(saved);
            if (variant.locale === "en" && variant.theme === "light" && width === 390) {
              await page.locator(scenario === "viewer" ? '[class*="viewerBackdrop"] [role="dialog"]' : '[class*="photoSection"]').screenshot({ path: resolve(output, `${key}-react.png`), animations: "disabled" });
              await html.locator(scenario === "viewer" ? "#viewer" : "#photoSection").screenshot({ path: resolve(output, `${key}-html.png`), animations: "disabled" });
            }
            if (scenario === "viewer") {
              await page.keyboard.press("Escape");
              await html.locator("#closeViewer").click();
            }
          }
        }
      } finally { releaseLoading(); await html.close(); }
      expect(observations).toHaveLength(16);
      writeFileSync(resolve(output, `${surface}-${scenario}.json`), JSON.stringify({
        approvedHtmlSha256: sha256, candidate: "production Next React on actual server",
        note: "Synthetic JPEG normalized in browser DOM only; truthful labels may differ; no source assets modified",
        observations,
      }, null, 2));
    });
  }
}
