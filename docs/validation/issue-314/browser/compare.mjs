import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(root, "../../../../apps/api/package.json"));
const sharp = require("sharp");
const caseIds = [
  "ar320-native200-dark", "en320-native200-light", "ar390-native200-light",
  "ar320-css200-dark", "ar320-normal-light", "en390-normal-dark",
  "ar768-normal-dark", "en1440-normal-light", "en1440-native200-light",
];
const unchanged = new Set([
  "ar320-normal-light", "en390-normal-dark", "ar768-normal-dark",
  "en1440-normal-light", "en1440-native200-light",
]);
const sha256 = (file) => existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : null;
const closeTo = (left, right, tolerance = 0.75) =>
  typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= tolerance;

async function pixelDifference(beforePath, afterPath) {
  if (!existsSync(beforePath) || !existsSync(afterPath)) return null;
  const first = await sharp(beforePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const second = await sharp(afterPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (first.info.width !== second.info.width || first.info.height !== second.info.height) {
    return { dimensionsMatch: false, beforeSize: [first.info.width, first.info.height],
      afterSize: [second.info.width, second.info.height] };
  }
  let changedPixels = 0;
  for (let p = 0; p < first.data.length; p += 4) {
    if (Math.abs(first.data[p] - second.data[p]) > 8 ||
        Math.abs(first.data[p + 1] - second.data[p + 1]) > 8 ||
        Math.abs(first.data[p + 2] - second.data[p + 2]) > 8 ||
        Math.abs(first.data[p + 3] - second.data[p + 3]) > 8) changedPixels++;
  }
  return { dimensionsMatch: true, changedPixels,
    fraction: +(changedPixels / (first.info.width * first.info.height)).toFixed(8),
    imageSize: [first.info.width, first.info.height], tolerancePerChannel: 8 };
}

const rows = await Promise.all(caseIds.map(async (id) => {
  const beforeFile = join(root, "before", `${id}.json`);
  const afterFile = join(root, "after", `${id}.json`);
  if (!existsSync(beforeFile) || !existsSync(afterFile)) {
    return { id, verdict: "NOT_RUN", before: existsSync(beforeFile), after: existsSync(afterFile) };
  }
  const before = JSON.parse(readFileSync(beforeFile, "utf8"));
  const after = JSON.parse(readFileSync(afterFile, "utf8"));
  const expectedZoom = before.item.zoom === "native" ? 2 : null;
  const nativeVerified = expectedZoom === null || [before, after].every((o) =>
    o.browserNativeReportedZoom === 2 &&
    closeTo(o.top.innerWidth, o.item.width / 2, 1) &&
    o.top.devicePixelRatio === 2 && o.top.cssZoom === "1" && o.top.visualScale === 1);
  const stableFields = before.top.facts.length === 10 && after.top.facts.length === 10 &&
    before.top.facts.every((row, index) => row.label === after.top.facts[index]?.label &&
      row.value === after.top.facts[index]?.value);
  const unchangedGeometry = !unchanged.has(id) ||
    before.top.facts.every((row, index) => {
      const afterRow = after.top.facts[index];
      return ["left", "right", "top", "bottom", "width", "height"].every((field) =>
        closeTo(row.row?.[field], afterRow?.row?.[field]));
    }) && before.top.buttons.every((button, index) =>
      ["left", "right", "top", "bottom"].every((field) =>
        closeTo(button.rect?.[field], after.top.buttons[index]?.rect?.[field])));
  const correctedGeometry = after.top.horizontal.buttonsInside && after.top.horizontal.valuesInside &&
    after.top.horizontal.listInside && after.top.horizontal.bodyInside &&
    after.top.horizontal.bodyNoInternalXScroll;
  const interactions = ["tabToHelp", "shiftTabToClose", "helpOpened", "helpRestoresTriggerFocus",
    "escapeClosed", "focusReturned"].every((key) => after.interactions[key] === true);
  const pointerAfter = correctedGeometry && after.interactions.helpPointerOpened === true &&
    after.interactions.closeClick === true;
  const fallback = ["ar320-normal-light", "en390-normal-dark"].includes(id)
    ? before.interactions.fallbackVisible && after.interactions.fallbackVisible
    : true;
  const targetNative = ["ar320-native200-dark", "en320-native200-light", "ar390-native200-light"].includes(id);
  const expectedImprovement = !targetNative || correctedGeometry;
  const pass = nativeVerified && stableFields && unchangedGeometry && interactions && fallback &&
    (!targetNative || (expectedImprovement && pointerAfter)) &&
    (unchanged.has(id) ? true : (targetNative ? correctedGeometry : true)) &&
    after.jsErrors.length === 0;
  const screenshots = Object.fromEntries(["top", "bottom", "list", "null"].map((kind) => [kind, {
    beforeSha256: sha256(join(root, "before", `${id}-${kind}.png`)),
    afterSha256: sha256(join(root, "after", `${id}-${kind}.png`)),
  }]));
  const pixel = unchanged.has(id) ? {
    top: await pixelDifference(join(root, "before", `${id}-top.png`), join(root, "after", `${id}-top.png`)),
    bottom: await pixelDifference(join(root, "before", `${id}-bottom.png`), join(root, "after", `${id}-bottom.png`)),
  } : null;
  const visualFreezeVerified = !unchanged.has(id) || [pixel?.top, pixel?.bottom].every((delta) =>
    delta?.dimensionsMatch === true && delta.changedPixels === 0);
  const diagnosticNoGo = id === "ar320-css200-dark" && !correctedGeometry;
  return {
    id, verdict: diagnosticNoGo ? "DIAGNOSTIC_NO_GO" : pass && visualFreezeVerified ? "PASS" : "FAIL", kind: before.item.zoom,
    physicalWidth: before.item.width, computedInnerWidth: [before.top.innerWidth, after.top.innerWidth],
    nativeReported: [before.browserNativeReportedZoom, after.browserNativeReportedZoom],
    stableFields, unchangedGeometry, visualFreezeVerified, pixel,
    nativeVerified, correctedGeometry, interactions,
    pointerAfter, fallback, expectedImprovement, screenshots,
    horizontalBefore: before.top.horizontal, horizontalAfter: after.top.horizontal,
    helpCloseBefore: before.top.buttons, helpCloseAfter: after.top.buttons,
    scrollBefore: before.bottom.bodyScrollTop, scrollAfter: after.bottom.bodyScrollTop,
    jsErrorsAfter: after.jsErrors,
  };
}));
const result = {
  baseline: "9abbbd2cf6ea062beabdcd06d8323ede474384dc",
  candidateProduction: "e34d9a1ca88a47d150da64b1d8beb6e07b81b7b7",
  note: "One unchanged synthetic fixture and W5 independent test source; CSS zoom is diagnostic only",
  nativeZoom: "Official Chrome MV3 chrome.tabs.setZoom(2) / getZoom()=2; no CDP pinch",
  counts: Object.fromEntries(["PASS", "FAIL", "NOT_RUN", "DIAGNOSTIC_NO_GO"].map((state) =>
    [state, rows.filter((row) => row.verdict === state).length])),
  cases: rows,
};
writeFileSync(join(root, "comparison.json"), JSON.stringify(result, null, 2));
for (const variant of ["before", "after"]) {
  const present = caseIds.filter((id) => existsSync(join(root, variant, `${id}.json`)));
  writeFileSync(join(root, variant, "manifest.json"), JSON.stringify({
    variant,
    sourceSHA: variant === "before" ? result.baseline : result.candidateProduction,
    origin: variant === "before" ? "http://localhost:3384" : "http://localhost:3385",
    caseIds: present,
    methodology: "Same W5 independent Playwright harness with one isolated Chromium MV3 context per individual case invocation",
    nativeZoom: result.nativeZoom,
    allCasesPresent: present.length === caseIds.length,
  }, null, 2));
}
console.log(JSON.stringify({ counts: result.counts,
  cases: rows.map(({ id, verdict, unchangedGeometry, correctedGeometry }) =>
    ({ id, verdict, unchangedGeometry, correctedGeometry })) }, null, 2));
if (rows.some((row) => row.verdict === "FAIL" || row.verdict === "NOT_RUN")) process.exitCode = 1;
