import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(scriptDir, "../../../apps/api/package.json"));
const sharp = require("sharp");
const evidenceRoot = resolve(process.argv[2] ?? process.env.ISSUE343_FREEZE_OUTPUT ?? "");
if (!evidenceRoot || !existsSync(evidenceRoot)) throw new Error(`Evidence directory missing: ${evidenceRoot}`);

const load = (target) => JSON.parse(readFileSync(join(evidenceRoot, target, "manifest.json"), "utf8"));
const baseline = load("baseline");
const feature = load("feature");
const byId = (manifest) => new Map(manifest.captures.map((entry) => [entry.id, entry]));
const before = byId(baseline);
const after = byId(feature);
const historicalSix = new Set([
  "emergency-1440-ar-dark",
  "emergency-320-en-light",
  "emergency-390-ar-dark",
  "details-768-ar-dark",
  "details-768-en-dark",
  "list-768-en-dark",
]);

async function pixels(path) {
  return sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function insideMask(x, y, masks) {
  return (masks ?? []).some(
    (mask) => x >= mask.x1 && x < mask.x2 && y >= mask.y1 && y < mask.y2,
  );
}

async function diff(firstPath, secondPath, masks = []) {
  const [first, second] = await Promise.all([pixels(firstPath), pixels(secondPath)]);
  const sameSize = first.info.width === second.info.width && first.info.height === second.info.height;
  if (!sameSize) {
    return {
      dimensionsMatch: false,
      beforeSize: [first.info.width, first.info.height],
      afterSize: [second.info.width, second.info.height],
      differentPixels: null,
      maskedChangedPixels: null,
      maxChannelDelta: null,
      diffBounds: null,
    };
  }
  let differentPixels = 0;
  let maskedChangedPixels = 0;
  let maxChannelDelta = 0;
  let minX = first.info.width;
  let minY = first.info.height;
  let maxX = -1;
  let maxY = -1;
  const channels = first.info.channels;
  for (let y = 0; y < first.info.height; y++) {
    for (let x = 0; x < first.info.width; x++) {
      const offset = (y * first.info.width + x) * channels;
      let changed = false;
      let localMax = 0;
      for (let channel = 0; channel < channels; channel++) {
        const delta = Math.abs(first.data[offset + channel] - second.data[offset + channel]);
        if (delta !== 0) changed = true;
        if (delta > localMax) localMax = delta;
      }
      if (!changed) continue;
      if (insideMask(x, y, masks)) {
        maskedChangedPixels++;
        continue;
      }
      differentPixels++;
      if (localMax > maxChannelDelta) maxChannelDelta = localMax;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    dimensionsMatch: true,
    imageSize: [first.info.width, first.info.height],
    differentPixels,
    maskedChangedPixels,
    maxChannelDelta,
    diffBounds: differentPixels ? [minX, minY, maxX + 1, maxY + 1] : null,
  };
}

function geometryEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const ids = [...before.keys()].sort();
const missing = ids.filter((id) => !after.has(id));
const extra = [...after.keys()].filter((id) => !before.has(id));
const cases = [];
for (const id of ids) {
  const source = before.get(id);
  const candidate = after.get(id);
  if (!candidate) continue;
  const masks = candidate.mask?.pixels ?? [];
  const [cross, baselineRepeat, featureRepeat] = await Promise.all([
    diff(source.primary, candidate.primary, masks),
    diff(source.primary, source.repeat),
    diff(candidate.primary, candidate.repeat),
  ]);
  cases.push({
    id,
    masks,
    maskCss: candidate.mask?.css ?? null,
    excludedDialogPixels: candidate.mask?.excludedDialogPixels ?? null,
    cross,
    baselineRepeat,
    featureRepeat,
    geometryMatch: geometryEqual(source.geometry, candidate.geometry),
    historicalResidual: historicalSix.has(id),
  });
}

const exactPairs = cases.filter((entry) => entry.cross.dimensionsMatch && entry.cross.differentPixels === 0).length;
const failedPairs = cases.filter((entry) => !entry.cross.dimensionsMatch || entry.cross.differentPixels !== 0);
const baselineDeterministic = cases.every((entry) => entry.baselineRepeat.dimensionsMatch && entry.baselineRepeat.differentPixels === 0);
const featureDeterministic = cases.every((entry) => entry.featureRepeat.dimensionsMatch && entry.featureRepeat.differentPixels === 0);
const geometryPass = cases.every((entry) => entry.geometryMatch);
const maskIds = cases.filter((entry) => entry.masks.length > 0).map((entry) => entry.id);
const maskScopePass = cases.every((entry) => {
  const allowed = entry.id.startsWith("details-") || entry.id.startsWith("emergency-");
  return allowed || entry.masks.length === 0;
});
const overlaps = (left, right) =>
  left.x1 < right.x2 && left.x2 > right.x1 && left.y1 < right.y2 && left.y2 > right.y1;
const emergencyOcclusionPass = cases
  .filter((entry) => entry.id.startsWith("emergency-"))
  .every((entry) =>
    entry.excludedDialogPixels !== null &&
    entry.masks.every((mask) => !overlaps(mask, entry.excludedDialogPixels)),
  );
const historical = cases.filter((entry) => entry.historicalResidual).map((entry) => ({
  id: entry.id,
  differentPixels: entry.cross.differentPixels,
  maxChannelDelta: entry.cross.maxChannelDelta,
}));
const summary = {
  baselineSha: baseline.sourceSha,
  featureSha: feature.sourceSha,
  browser: baseline.browser,
  renderer: baseline.renderer,
  pairCount: cases.length,
  exactPairs,
  failingPairs: failedPairs.length,
  totalDifferingUnmaskedPixels: cases.reduce((sum, entry) => sum + (entry.cross.differentPixels ?? 0), 0),
  baselineDeterministic,
  featureDeterministic,
  geometryPass,
  masksUsed: maskIds.length,
  maskScopePass,
  emergencyOcclusionPass,
  missing,
  extra,
  historicalSixExplained: historical.length === 6 && historical.every((entry) => entry.differentPixels === 0),
  verdict: "INCONCLUSIVE",
};
const complete = cases.length === 48 && missing.length === 0 && extra.length === 0;
if (complete && exactPairs === 48 && baselineDeterministic && featureDeterministic && geometryPass && maskScopePass && emergencyOcclusionPass)
  summary.verdict = "PASS";
else if (complete && failedPairs.length > 0)
  summary.verdict = "FAIL";

const result = { summary, historicalSix: historical, cases };
writeFileSync(join(evidenceRoot, "comparison.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ summary, historicalSix: historical, failures: failedPairs.map((entry) => ({
  id: entry.id,
  cross: entry.cross,
  geometryMatch: entry.geometryMatch,
})) }, null, 2));
process.exitCode = summary.verdict === "PASS" ? 0 : 1;
