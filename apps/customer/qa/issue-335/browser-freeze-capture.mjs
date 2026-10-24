import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Capture only the Guest presentation subtree after animations and fonts settle.
export function createFrozenGuestCapture({
  zoom,
  phase,
  root,
  directory,
  cases,
}) {
  return async (page, name) => {
    if (zoom) await page.waitForFunction(() => devicePixelRatio === 2);
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.effect?.getTiming().iterations === Infinity ||
            animation.playState === "finished",
        ),
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.querySelectorAll("header *, main *")].map(async (el) => {
          const style = getComputedStyle(el);
          await document.fonts.load(
            `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          );
        }),
      );
      document.getAnimations().forEach((animation) => {
        if (animation.effect?.getTiming().iterations === Infinity) {
          animation.pause();
          animation.currentTime = 0;
        }
      });
      await new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      );
    });
    const dom = await page.evaluate(() => {
      const rootElement = document.querySelector("header")?.parentElement;
      return {
        html: rootElement?.outerHTML,
        elements: [...(rootElement?.querySelectorAll("*") || [])].map((el) => {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            tag: el.tagName,
            box: [box.x, box.y, box.width, box.height],
            style: Object.fromEntries(
              [...style]
                .sort()
                .map((key) => [key, style.getPropertyValue(key)]),
            ),
          };
        }),
      };
    });
    const domBytes = JSON.stringify(dom);
    const png = await page.screenshot({ fullPage: true, animations: "allow" });
    await writeFile(join(directory, `${name}.json`), domBytes);
    await writeFile(join(directory, `${name}.png`), png);
    const result = { name, pixelEqual: null, domEqual: null };
    if (phase === "after") {
      const [oldDom, oldPng] = await Promise.all([
        readFile(join(root, "before", `${name}.json`), "utf8"),
        readFile(join(root, "before", `${name}.png`)),
      ]);
      result.pixelEqual = oldPng.equals(png);
      result.domEqual = oldDom === domBytes;
    }
    cases.push(result);
  };
}
