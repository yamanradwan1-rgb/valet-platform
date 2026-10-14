import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { measuredIntersections, newlyIntroducedOverlaps, measuredKinds } from "./issue278-overlap-geometry.mjs";

const folder = process.argv[2];
if (!folder) throw new Error("Usage: node scripts/issue278-e-f-compare.mjs <evidence-directory>");
const before = join(folder, "before");
const after = join(folder, "after");
mkdirSync(folder, { recursive: true });
const evidence = (dir) => new Map(existsSync(dir) ? readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => [basename(name, ".json"), JSON.parse(readFileSync(join(dir, name), "utf8"))]) : []);
const a = evidence(before);
const b = evidence(after);
const all = [...new Set([...a.keys(), ...b.keys()])].sort();
const anchors = ["heading", "sections", "cards", "tables", "rows", "tabs", "saves"];
function intersections(record) {
  const overlaps = [];
  for (const help of record?.help ?? []) {
    for (const control of record?.controls ?? []) {
      const h = help.rect;
      const c = control.rect;
      const width = Math.max(0, Math.min(h.x + h.w, c.x + c.w) - Math.max(h.x, c.x));
      const height = Math.max(0, Math.min(h.y + h.h, c.y + c.h) - Math.max(h.y, c.y));
      if (width * height > 1) overlaps.push({ help: help.label, control: control.text, area: +(width * height).toFixed(2) });
    }
  }
  return overlaps;
}
const measured = [];
for (const id of all) {
  const older = a.get(id);
  const newer = b.get(id);
  const changes = [];
  if (older && newer) {
    if (older.path !== newer.path) changes.push({ selector: "route", kind: "path", before: older.path, after: newer.path });
    for (const anchor of anchors) {
      const left = older[anchor] ?? [];
      const right = newer[anchor] ?? [];
      if (left.length !== right.length) changes.push({ selector: anchor, kind: "count", before: left.length, after: right.length });
      for (let i = 0; i < Math.min(left.length, right.length); ++i) {
        const delta = Object.fromEntries(["x", "y", "w", "h"].map((dimension) => [dimension,
          Number((right[i].rect[dimension] - left[i].rect[dimension]).toFixed(2))]));
        if (Object.values(delta).some((value) => Math.abs(value) > 2)) {
          changes.push({ selector: anchor + `[${i}]`, kind: "geometry", before: left[i].rect, after: right[i].rect, delta });
        }
      }
    }
    if (older.horizontalOverflow !== newer.horizontalOverflow) changes.push({
      selector: "document", kind: "overflow", before: older.horizontalOverflow, after: newer.horizontalOverflow,
    });
  }
  const overlaps = intersections(newer);
  const baselineOverlaps = intersections(older);
  const newOverlaps = older?.controls ? overlaps.filter((item) =>
    !baselineOverlaps.some((previous) => previous.help === item.help && previous.control === item.control),
  ) : [];
  const semanticBefore = measuredIntersections(older);
  const semanticAfter = measuredIntersections(newer);
  const semanticIntroduced = newlyIntroducedOverlaps(semanticBefore, semanticAfter);
  measured.push({ id, hasBefore: Boolean(older), hasAfter: Boolean(newer),
    currentRoute: newer?.path, lang: newer?.locale, theme: newer?.theme,
    helpBefore: older?.help.length ?? null, helpAfter: newer?.help.length ?? null,
    newHelp: (newer?.help ?? []).filter((item) => !(older?.help ?? []).some((prior) => prior.label === item.label)).map((item) => item.label),
    allHelpVisible: newer?.help.every((item) => item.visible) ?? false,
    overflowBefore: older?.horizontalOverflow ?? null, overflowAfter: newer?.horizontalOverflow ?? null,
    changes, helpControlOverlaps: overlaps, baselineHelpOverlaps: baselineOverlaps,
    newlyIntroducedHelpOverlaps: newOverlaps,
    semanticBefore, semanticAfter, semanticIntroduced,
  });
}
const complete = measured.filter((entry) => entry.hasBefore && entry.hasAfter);
const differences = measured.filter((entry) => entry.changes.length > 0);
const missing = measured.filter((entry) => !entry.hasBefore || !entry.hasAfter);
const summary = {
  baselineSHA: "c8e87c59689b54d66bcf6b2d00ff417c29f2c369",
  paired: complete.length, before: a.size, after: b.size,
  missing: missing.map((entry) => entry.id),
  geometryDifferent: differences.map((entry) => entry.id),
  totalGeometryChanges: differences.reduce((count, entry) => count + entry.changes.length, 0),
  mismatchedHelpVisibility: complete.filter((entry) => !entry.allHelpVisible).map((entry) => entry.id),
  helpHitTargetCollisions: measured.filter((entry) => entry.helpControlOverlaps.length).map((entry) => entry.id),
  introducedHelpHitTargetCollisions: measured.filter((entry) => entry.newlyIntroducedHelpOverlaps.length).map((entry) => entry.id),
  semanticPaired: measured.filter((entry) => entry.semanticBefore !== null && entry.semanticAfter !== null).length,
  semanticUnknown: measured.filter((entry) => entry.semanticBefore === null || entry.semanticAfter === null).map((entry) => entry.id),
  newSemanticCollisionCases: measured.filter((entry) => entry.semanticIntroduced?.length).map((entry) => entry.id),
  semanticCategories: measuredKinds,
};
writeFileSync(join(folder, "comparison.json"), JSON.stringify({ summary, cases: measured }, null, 2));
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const cards = measured.map((item) => {
  const left = item.hasBefore ? `<img src="before/${escapeHtml(item.id)}.png" loading="lazy" alt="Before: ${escapeHtml(item.id)}">` : "<p>No baseline capture</p>";
  const right = item.hasAfter ? `<img src="after/${escapeHtml(item.id)}.png" loading="lazy" alt="After: ${escapeHtml(item.id)}">` : "<p>No final capture</p>";
  return `<article id="${escapeHtml(item.id)}"><h2>${escapeHtml(item.id)}</h2><p>Geometry deltas: ${item.changes.length}; baseline/new help: ${item.helpBefore} → ${item.helpAfter}</p><div class="pair"><figure><figcaption>BEFORE</figcaption>${left}</figure><figure><figcaption>AFTER</figcaption>${right}</figure></div><details><summary>Measured delta JSON</summary><pre>${escapeHtml(JSON.stringify(item.changes, null, 2))}</pre></details></article>`;
}).join("\n");
writeFileSync(join(folder, "index.html"), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VAYLET #278 baseline/final visual evidence</title><style>body{background:#f1f5f9;color:#0f172a;font:15px system-ui,sans-serif;margin:20px}article{padding:1.2rem;margin:1rem 0;border:1px solid #cbd5e1;border-radius:10px;background:white}h1,h2{overflow-wrap:anywhere}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pair figure{margin:0;min-width:0;overflow:auto}.pair img{display:block;max-width:100%;border:1px solid #94a3b8}pre{overflow:auto;max-height:300px}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style></head><body><h1>Issue #278 — real baseline vs final</h1><p>Baseline ${escapeHtml(summary.baselineSHA)}. Paired ${complete.length}; geometry-different cases ${differences.length}; missing cases ${missing.length}.</p>${cards}</body></html>`);
const findings = [
  "# Issue #278 E/F visual comparison (generated)", "",
  `Baseline: ${summary.baselineSHA}. Comparison uses independent checked-out main and Phase E/F dev servers, synthetic fixture data.`,
  `Before screenshot/geometry sets: **${summary.before}**. After sets: **${summary.after}**. Paired: **${summary.paired}**.`,
  `Cases with any measured non-Help geometry change over 2px: **${differences.length}**; changed anchors: **${summary.totalGeometryChanges}**.`,
  `Cases with Help-versus-control rectangle intersections (review individually): **${summary.helpHitTargetCollisions.length}**.`,
  `Cases with new Help/control intersections relative to the measured baseline: **${summary.introducedHelpHitTargetCollisions.length}**.`,
  `Equivalent schema semantic evidence pairs: **${summary.semanticPaired}**. Unknown/missing semantic schema cases: **${summary.semanticUnknown.length}**.`,
  `Cases with introduced visible semantic intersections: **${summary.newSemanticCollisionCases.length}**.`,
  "", "## Important limitations", "",
  "Measurements are deterministic single-browser Playwright renderings, but are not proof of all production account states. Inspect each delta in comparison.json and HTML before classifying a new U-004 deviation.",
  "The zoom200-css captures use DOM CSS zoom; the separate issue278-help-zoom.spec.ts tests real Chromium page-scale zoom.",
  "Help/control intersections are raw bounding-box intersections and can include clipped/invisible regions of scrollable controls; inspect actual screenshots and whether the same pairing existed on baseline.",
  "The semantic collision computation covers buttons, scope badges, page titles, subtitles, table headers; each record stores raw and viewport/scroll-clipped visible areas, hit targeting and baseline provenance. Missing schema stays UNKNOWN.",
  "", "## Missing/mismatched captures", "", ...missing.map((item) => `- ${item.id}`),
  "", "## Cases with measured geometry changes", "",
  ...differences.map((item) => `- ${item.id}: ${item.changes.map((change) => change.selector + " (" + change.kind + ")").join(", ")}`),
  "", "## Help visibility issues", "", ...summary.mismatchedHelpVisibility.map((id) => `- ${id}`), "",
  "## Help-versus-action collisions", "",
  ...measured.filter((item) => item.helpControlOverlaps.length).map((item) => `- ${item.id}: ${item.helpControlOverlaps.map((hit) => `${hit.help} / ${hit.control} (${hit.area}px²)`).join("; ")} — baseline ${item.baselineHelpOverlaps.length}, introduced ${item.newlyIntroducedHelpOverlaps.length}`), "",
  "## Newly introduced visible semantic collisions", "",
  ...measured.filter((item) => item.semanticIntroduced?.length).map((item) =>
    `- ${item.id} (${item.currentRoute}, ${item.lang}, ${item.theme}): ${item.semanticIntroduced.map((hit) => `${hit.kind} ${hit.target} (${hit.visibleArea}px², raw ${hit.rawArea}px²)`).join("; ")}`), "",
  "## Incomplete comparable semantic evidence", "", ...summary.semanticUnknown.map((id) => `- ${id}`), "",
];
writeFileSync(join(folder, "findings.md"), findings.join("\n"));
console.log(JSON.stringify(summary, null, 2));
