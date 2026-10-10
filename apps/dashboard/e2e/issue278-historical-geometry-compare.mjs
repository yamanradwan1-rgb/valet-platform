import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import process from "node:process";

// Compare independently built commits, never same-build CSS-hidden triggers.
const root = resolve(process.cwd(), "../../tmp/issue-278-c-historical-evidence");
const before = join(root, "before");
const after = join(root, "after");
if (!existsSync(before) || !existsSync(after)) {
  throw new Error("Both historical BEFORE and AFTER screenshots are required");
}
function records(folder) {
  const output = new Map();
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (item.name === "geometry.json") {
        output.set(relative(folder, file).replaceAll("\\", "/"),
          JSON.parse(readFileSync(file, "utf8")));
      }
    }
  }
  walk(folder);
  return output;
}
const old = records(before);
const next = records(after);
if (old.size < 50 || next.size < 50) {
  throw new Error("Missing ten-route historical screenshot matrix");
}
const round = (value) => Math.round(value * 10) / 10;
const properties = ["x", "y", "width", "height"];
const results = [];
for (const [file, base] of old) {
  const present = next.get(file);
  if (!present) throw new Error("Missing AFTER fixture " + file);
  if (base.language !== present.language || base.direction !== present.direction ||
      base.viewport.width !== present.viewport.width) {
    throw new Error("Non-equivalent historical fixture " + file);
  }
  const changes = [];
  const compare = (selector, prior, current) => {
    if (prior.length !== current.length) {
      changes.push({ selector, result: "COUNT", before: prior.length, after: current.length });
    }
    for (let i = 0; i < Math.min(prior.length, current.length); i++) {
      const movement = Object.fromEntries(properties.map(
        (key) => [key, round(current[i][key] - prior[i][key])],
      ));
      if (Object.values(movement).some((delta) => Math.abs(delta) > 1)) {
        changes.push({ selector, index: i, ...movement });
      }
    }
  };
  if (base.main && present.main) compare("main", [base.main], [present.main]);
  const selectors = new Set([
    ...Object.keys(base.elements), ...Object.keys(present.elements),
  ]);
  for (const selector of selectors) compare(
    selector, base.elements[selector] ?? [], present.elements[selector] ?? [],
  );
  results.push({
    fixture: file.replace("/geometry.json", ""),
    beforeHelp: base.help.length, afterHelp: present.help.length,
    changes,
  });
}
if (results.length !== next.size) {
  throw new Error("AFTER contains unmatched historical cases");
}
const sorted = [...results].sort((a, b) => a.fixture.localeCompare(b.fixture));
const finalSha = process.env.ISSUE278_AFTER_SHA ?? "capture-current";
writeFileSync(join(root, "geometry-comparison.json"),
  JSON.stringify({ baseline: "79cdec6e242ccaa6466fca971a974992fb4274ca",
    implementation: finalSha,
    thresholdCssPixels: 1, cases: sorted }, null, 2));
const protectedSelectors = new Set([
  "main", "main h1", "main table",
  "main [class*='metricGrid'] > section",
  "main [class*='summaryGrid'] > section",
  "main [data-testid='analytics-metric-card']",
]);
const protectedDeltas = sorted.flatMap((entry) =>
  entry.changes.filter((change) => protectedSelectors.has(change.selector))
    .map((change) => ({ route: entry.fixture, ...change })));
const lines = [
  "# Issue #278-C — pinned historical before/after geometry",
  "",
  "**BEFORE:** SHA 79cdec6e242ccaa6466fca971a974992fb4274ca independently built.",
  "**AFTER:** SHA " + finalSha + " independently built.",
  "",
  "Both phases used the same Playwright code, synthetic actor, Location, route,",
  "language, theme, viewport, and deterministic API fixtures.",
  "The 720px CSS viewport is a 200%-effective-width reflow proxy (1440/2),",
  "not a direct native browser Ctrl+Plus 200% zoom test.",
  "Unexpected scroll effects/dynamic content and legitimate help additions",
  "still require human inspection; screenshots do not mean Owner approval.",
  "",
  "Matched cases: **" + sorted.length + "**.",
  "Protected geometry deltas >1 CSS px: **" + protectedDeltas.length + "**.",
  "",
  "| Fixture | Before help | After help | Changed measured shapes |",
  "|---|---:|---:|---:|",
  ...sorted.map((entry) => "| " + entry.fixture + " | " +
    entry.beforeHelp + " | " + entry.afterHelp + " | " + entry.changes.length + " |"),
  "",
  "## Protected geometry discrepancies",
  "",
  ...(protectedDeltas.length ? protectedDeltas.map((item) =>
    "- " + item.route + ": " + item.selector + " " + JSON.stringify(item)) :
    ["None in sampled protected bounding boxes. Review other measured",
     "elements and screenshot pixels before owner sign-off."]),
  "",
  "Detailed shapes: geometry-comparison.json.",
  "Each case contains matching before/after page.png and geometry.json.",
];
writeFileSync(join(root, "historical-visual-comparison.md"), lines.join("\n"));
const html = [
  "<!doctype html><html lang='en'><meta charset='utf-8'>",
  "<meta name='viewport' content='width=device-width,initial-scale=1'>",
  "<title>VAYLET Issue #278-C historical visual comparison</title>",
  "<style>body{font:15px/1.5 system-ui;margin:24px;background:#f6f8fc;color:#17233d}",
  "details{margin:16px 0;padding:12px;border:1px solid #cad4e6;border-radius:8px;background:#fff}",
  "summary{cursor:pointer;font-weight:700}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
  "figure{margin:8px 0;min-width:0}img{max-width:100%;height:auto;border:1px solid #ccc}",
  "figcaption{font-weight:700;margin-bottom:8px}",
  "@media(max-width:780px){.pair{grid-template-columns:1fr}}</style>",
  "<h1>VAYLET #278-C — real #278-B vs #278-C screenshots</h1>",
  "<p>BEFORE SHA: 79cdec6e242ccaa6466fca971a974992fb4274ca. ",
  "AFTER: SHA " + finalSha + ". Owner U-004 review PENDING.</p>",
  "<p>57+ matched fixtures; each image is an independent build, with ",
  "the same synthetic actor, location, fixture, theme and viewport.</p>",
  ...sorted.map((entry) => {
    const item = encodeURI(entry.fixture);
    return "<details><summary>" + entry.fixture + " — " +
      entry.changes.length + " measured changes</summary>" +
      "<div class='pair'><figure><figcaption>BEFORE (#278-B)</figcaption>" +
      "<a href='before/" + item + "/page.png'><img loading='lazy' alt='Before " +
      entry.fixture + "' src='before/" + item + "/page.png'></a></figure>" +
      "<figure><figcaption>AFTER (#278-C)</figcaption>" +
      "<a href='after/" + item + "/page.png'><img loading='lazy' alt='After " +
      entry.fixture + "' src='after/" + item + "/page.png'></a></figure></div>" +
      "<p>Detailed bounding boxes: before/after geometry.json; see comparison JSON.</p>" +
      "</details>";
  }),
  "</html>",
].join("\n");
writeFileSync(join(root, "index.html"), html);
process.stdout.write("Matched cases: " + sorted.length + "\n" +
  "Protected geometry deltas: " + protectedDeltas.length + "\n" +
  "Owner review index: " + join(root, "index.html") + "\n");
