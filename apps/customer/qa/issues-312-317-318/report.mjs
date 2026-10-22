import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const requireFromCustomer = createRequire(
  new URL("../../package.json", import.meta.url),
);
const requireFromNext = createRequire(
  requireFromCustomer.resolve("next/package.json"),
);
const sharp = requireFromNext("sharp");
const evidence = resolve(process.env.QA_EVIDENCE || "qa-evidence");
const results = [];
for (const file of (await readdir(join(evidence, "after")))
  .filter((name) => name.endsWith(".png"))
  .sort()) {
  const before = await readFile(join(evidence, "before", file));
  const after = await readFile(join(evidence, "after", file));
  let changedPixels = 0;
  let maximumChannelDelta = 0;
  if (!before.equals(after)) {
    const a = await sharp(before)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const b = await sharp(after)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (a.info.width !== b.info.width || a.info.height !== b.info.height)
      changedPixels = -1;
    else
      for (let pixel = 0; pixel < a.data.length; pixel += 4) {
        let changed = false;
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs(
            a.data[pixel + channel] - b.data[pixel + channel],
          );
          maximumChannelDelta = Math.max(maximumChannelDelta, delta);
          changed ||= delta !== 0;
        }
        if (changed) changedPixels++;
      }
  }
  let dom = null;
  if (!file.includes("native200")) {
    const a = JSON.parse(
      await readFile(join(evidence, "before", file.replace(".png", ".json"))),
    );
    const b = JSON.parse(
      await readFile(join(evidence, "after", file.replace(".png", ".json"))),
    );
    const boxesEqual =
      JSON.stringify(a.elements.map((x) => x.box)) ===
      JSON.stringify(b.elements.map((x) => x.box));
    const stylesEqual =
      JSON.stringify(a.elements.map((x) => x.style)) ===
      JSON.stringify(b.elements.map((x) => x.style));
    dom = { htmlEqual: a.html === b.html, boxesEqual, stylesEqual };
  }
  results.push({
    file,
    pngBytesEqual: before.equals(after),
    changedPixels,
    maximumChannelDelta,
    dom,
    pass: changedPixels === 0 && (!dom || Object.values(dom).every(Boolean)),
  });
}
const report = {
  baselineSha: "27b22d13fdb450e1468822728028e046b76ff92c",
  implementationSha: process.env.QA_IMPLEMENTATION_SHA || "working-tree",
  policy:
    "No masks, thresholds, excluded pixels or DOM/style normalization. Animation timing fixed identically.",
  evidenceLevel:
    "Production Chromium; visual states use synthetic HTTP contract fixtures. Separate real API/PostgreSQL browser test.",
  total: results.length,
  passed: results.filter((x) => x.pass).length,
  results,
};
await writeFile(
  join(evidence, "comparison.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      total: report.total,
      passed: report.passed,
      failures: results.filter((x) => !x.pass),
    },
    null,
    2,
  ),
);
if (report.passed !== report.total) process.exitCode = 1;
