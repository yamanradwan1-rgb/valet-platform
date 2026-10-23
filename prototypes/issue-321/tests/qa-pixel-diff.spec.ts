import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("../evidence/qa/", import.meta.url));
const baseline = JSON.parse(readFileSync(join(evidence, "../baseline/geometry.json"), "utf8"));

test("global sidebar and topbar pixel parity vs actual Dashboard screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  const results = [];
  for (const option of ["a", "b", "c", "d"]) {
    for (const reference of baseline.cases.filter((entry: { id: string }) => entry.id.endsWith("zoom100"))) {
      const prefix = reference.id;
      const left = readFileSync(join(evidence, "../baseline", `${prefix}.png`)).toString("base64");
      const right = readFileSync(join(evidence, `${option}-${prefix}.png`)).toString("base64");
      const regions = [".sidebar", ".topbar"].map((selector) => ({
        name: selector,
        rect: reference.nodes?.[selector]?.rect ?? null,
        display: reference.nodes?.[selector]?.display ?? "none",
      }));
      const metrics = await page.evaluate(async ({ baselinePng, prototypePng, rects }) => {
        const loadImage = (base64: string) => new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${base64}`;
        });
        const [first, second] = await Promise.all([loadImage(baselinePng), loadImage(prototypePng)]);
        const context = (img: HTMLImageElement) => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, img.width, img.height).data;
        };
        const lhs = context(first);
        const rhs = context(second);
        return rects.map(({ name, rect, display }) => {
          if (!rect || display === "none" || !rect.width || !rect.height) {
            return { name, skipped: true, totalPixels: 0, differingPixels: 0, differingOver8: 0 };
          }
          const x0 = Math.max(0, Math.floor(rect.x));
          const y0 = Math.max(0, Math.floor(rect.y));
          const x1 = Math.min(first.width, second.width, Math.ceil(rect.x + rect.width));
          const y1 = Math.min(first.height, second.height, Math.ceil(rect.y + rect.height));
          let differingPixels = 0;
          let differingOver8 = 0;
          let minX = x1, minY = y1, maxX = x0, maxY = y0;
          const changedRows: Record<string, number> = {};
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const p = (y * first.width + x) * 4;
              const q = (y * second.width + x) * 4;
              let largestChannelDiff = 0;
              for (let c = 0; c < 4; c++) {
                largestChannelDiff = Math.max(largestChannelDiff, Math.abs(lhs[p + c] - rhs[q + c]));
              }
              if (largestChannelDiff) differingPixels++;
              if (largestChannelDiff > 8) {
                differingOver8++;
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                changedRows[String(Math.floor(y / 40) * 40)] = (changedRows[String(Math.floor(y / 40) * 40)] ?? 0) + 1;
              }
            }
          }
          return { name, skipped: false, totalPixels: (x1 - x0) * (y1 - y0),
            differingPixels, differingOver8,
            diffBounds: differingOver8 ? { minX, minY, maxX, maxY } : null,
            changedRows };
        });
      }, { baselinePng: left, prototypePng: right, rects: regions });
      results.push({ option, id: prefix, regions: metrics });
    }
  }
  writeFileSync(join(evidence, "shell-pixel-diffs.json"), JSON.stringify({
    measurement: "Exact RGBA pixel comparison of global .sidebar and .topbar rectangles at zoom100",
    cases: results,
  }, null, 2));
  expect(results).toHaveLength(64);
});
