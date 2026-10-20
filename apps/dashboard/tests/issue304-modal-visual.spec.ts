import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { enterInspector, inspector, setLocale, setTheme } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";
import { approvedHtml, compareViewportPixels, configureApprovedHtml } from "./issue304-parity";

// Final, clean production capture for W4/W5 HEAD 4bf9ace7. Never overwrite
// the immutable earlier `modals` and `modals-after` baseline evidence.
const output = process.env.ISSUE304_MODAL_OUTPUT
  ? join(process.cwd(), process.env.ISSUE304_MODAL_OUTPUT)
  : join(process.cwd(), "../../docs/validation/issue304-w6/modals-final");
type Operation = "qr" | "key" | "spot" | "zone";

async function openLive(page: Page, kind: Operation) {
  if (kind !== "key") {
    await inspector(page).locator('[data-c-family="spots"]').click();
  }
  if (kind === "qr") {
    await inspector(page).locator('[data-resource-code="P-02"]').click();
    await inspector(page).locator(".c-detail .c-qr-action").click();
  } else if (kind === "zone") {
    await inspector(page).locator(".c-add-zone").click();
  } else {
    await inspector(page).locator(".c-add").click();
  }
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openApproved(page: Page, kind: Operation) {
  if (kind !== "key") await page.locator('[data-c-family="spots"]').click();
  if (kind === "qr") {
    const row = page.locator('[data-c-list] button').filter({ hasText: "P-02" }).first();
    await row.click();
    await page.locator("[data-c-open-qr]").click();
  } else if (kind === "zone") {
    await page.locator("[data-c-open-zone]").click();
  } else {
    await page.locator("[data-c-open-add]").click();
  }
  const dialog = page.locator("[data-c-modal] .c-modal");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function getDialogStyle(dialog: ReturnType<Page["locator"]>) {
  return dialog.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const heading = el.querySelector("h2");
    const shape = (node: Element | null) => {
      if (!node) return null;
      const bounds = node.getBoundingClientRect();
      const computed = getComputedStyle(node);
      return { x: Math.round(bounds.x), y: Math.round(bounds.y),
        width: Math.round(bounds.width), height: Math.round(bounds.height),
        display: computed.display, fontSize: computed.fontSize, lineHeight: computed.lineHeight,
        padding: computed.padding, margin: computed.margin };
    };
    const controls = [...el.querySelectorAll("button")]
      .filter((button) => getComputedStyle(button).display !== "none")
      .map((button) => ({ name: button.getAttribute("aria-label") ?? button.textContent?.trim(),
        rect: shape(button) }));
    return {
      rect: { x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height) },
      padding: style.padding, radius: style.borderRadius, background: style.backgroundColor,
      headingText: heading?.textContent?.trim() || "",
      headingFont: heading ? getComputedStyle(heading).fontSize : "",
      headingBox: shape(heading), disclaimer: shape(el.querySelector(".c-modal-disclaimer")),
      qrArt: shape(el.querySelector(".c-qr-art")),
      actions: shape(el.querySelector(".c-modal-actions")),
      controls,
      focusInside: el.contains(document.activeElement),
    };
  });
}

for (const width of [320, 390, 768, 1440]) {
  for (const locale of ["en", "ar"] as const) {
    for (const theme of ["light", "dark"] as const) {
    for (const kind of ["qr", "key", "spot", "zone"] as const) {
      test(`Issue304 real ${kind} modal parity ${width} ${locale}/${theme}`, async ({ browser, page }) => {
        const source = approvedHtml();
        const fixture = issue304Fixture();
        const writes: string[] = [];
        await fixture.install(page);
        page.on("request", (request) => {
          if (request.method() !== "GET" && request.url().includes("/physical-resources/"))
            writes.push(request.url());
        });
        await page.setViewportSize({ width, height: 900 });
        await enterInspector(page);
        await setLocale(page, locale);
        await setTheme(page, theme);
        const reference = await browser.newContext({ viewport: { width, height: 900 } });
        const approved = await reference.newPage();
        try {
          await approved.goto(source.uri);
          await configureApprovedHtml(approved, locale, theme);
          const nativeModal = await openLive(page, kind);
          const mockModal = await openApproved(approved, kind);
          const nativeStyle = await getDialogStyle(nativeModal);
          const mockStyle = await getDialogStyle(mockModal);
          expect(nativeStyle.focusInside, "Native dialog must own keyboard focus").toBe(true);
          expect(writes, "Viewing a resource/starting create must be read-only").toEqual([]);
          const name = `modal-${kind}-${width}-${locale}-${theme}`;
          mkdirSync(output, { recursive: true });
          const approvedPng = await approved.screenshot({ path: join(output, `${name}-approved.png`), animations: "disabled" });
          const nativePng = await page.screenshot({ path: join(output, `${name}-integrated.png`), animations: "disabled" });
          const delta = await compareViewportPixels(page, approvedPng, nativePng);
          const geometryDelta = {
            x: nativeStyle.rect.x - mockStyle.rect.x,
            y: nativeStyle.rect.y - mockStyle.rect.y,
            width: nativeStyle.rect.width - mockStyle.rect.width,
            height: nativeStyle.rect.height - mockStyle.rect.height,
          };
          writeFileSync(join(output, `${name}-comparison.json`), JSON.stringify({
            approvedSha256: source.hash, kind, width, locale, theme,
            approved: mockStyle, integrated: nativeStyle,
            widthDeltaPx: nativeStyle.rect.width - mockStyle.rect.width,
            geometryDelta, exactDialogRect: Object.values(geometryDelta).every((n) => n === 0),
            pixelDelta: delta, classification: "PENDING_INDEPENDENT_VISUAL_REVIEW",
            note: "Production QR uses real persisted payload; approved HTML QR is illustrative",
          }, null, 2));
          await page.keyboard.press("Escape");
          await expect(nativeModal).toHaveCount(0);
        } finally { await reference.close(); }
      });
    }
    }
  }
}
