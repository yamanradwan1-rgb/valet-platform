import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import process from "node:process";

const root = resolve(process.cwd(), "../../tmp/issue-278-c-u004-remediation-evidence");
const previous = resolve(process.cwd(), "../../tmp/issue-278-c-historical-evidence");
const routes = ["overview", "payments", "analytics", "maps-zones",
  "live-operations", "vehicles", "tasks", "incidents"];
const variants = ["en-light-1440", "ar-dark-390", "en-dark-390",
  "ar-light-320", "en-light-320", "en-light-effective-200pct", "ar-light-1440"];
const sha = process.env.ISSUE278_REPAIR_SHA ?? "uncommitted-verified-code";
const pinned = {
  before: "79cdec6e242ccaa6466fca971a974992fb4274ca",
  defect: "ad72b6f6e039f8dd679b808e17dac8086600122c",
  repair: sha,
};

const round = (n) => Math.round(n * 100) / 100;
const rows = [];
for (const route of routes) {
  for (const variant of variants) {
    const caseName = route + "/" + variant;
    const repairedFile = join(root, "repair", caseName, "geometry.json");
    if (!existsSync(repairedFile)) continue;
    const current = JSON.parse(readFileSync(repairedFile, "utf8"));
    const old = {};
    for (const phase of ["before", "after"]) {
      const source = join(previous, phase, caseName);
      const targetPhase = phase === "before" ? "before" : "defect";
      const target = join(root, targetPhase, caseName);
      if (!existsSync(join(target, "geometry.json"))) {
        if (!existsSync(join(source, "geometry.json"))) continue;
        mkdirSync(target, { recursive: true });
        copyFileSync(join(source, "page.png"), join(target, "page.png"));
        copyFileSync(join(source, "geometry.json"), join(target, "geometry.json"));
      }
      old[targetPhase] = JSON.parse(readFileSync(join(target, "geometry.json"), "utf8"));
    }
    const tableY = (snapshot) => (snapshot?.geometry?.tables ??
      snapshot?.elements?.["main table"] ?? []).map((table) => round(table.y));
    const repairY = current.geometry.tables.map((table) => round(table.y));
    const baselineY = tableY(old.before);
    const defectY = tableY(old.defect);
    const changes = baselineY.map((value, index) => ({
      before: value, defect: defectY[index] ?? null,
      repaired: repairY[index] ?? null,
      oldDelta: defectY[index] === undefined ? null : round(defectY[index] - value),
      repairedDelta: repairY[index] === undefined ? null : round(repairY[index] - value),
    }));
    rows.push({ caseName, viewport: current.variant.width, locale: current.variant.locale,
      targets: current.targets, tables: changes, hasPinnedComparison: !!old.before && !!old.defect });
  }
}
if (rows.length !== routes.length * variants.length) {
  throw new Error("Incomplete repair matrix: expected 56 cases, found " + rows.length);
}
if (rows.filter((row) => row.hasPinnedComparison).length !== routes.length * 5) {
  throw new Error("Incomplete pinned three-way evidence; expected 40 cases");
}
const unresolved = rows.flatMap((row) => row.tables
  .filter((table) => table.repairedDelta !== null && Math.abs(table.repairedDelta) > 1)
  .map((table) => ({ caseName: row.caseName, table })));
if (unresolved.length) {
  throw new Error("Unapproved table geometry drift: " + JSON.stringify(unresolved));
}
const summary = {
  shas: pinned,
  matrix: rows,
  capturedAt: "Read from deterministic Playwright evidence files",
  note: "320px new responsive cases have no pinned historical comparison; never infer one",
};
writeFileSync(join(root, "geometry-comparison.json"), JSON.stringify(summary, null, 2));

const md = [
  "# VAYLET #278-C U-004 — independently rendered remediation evidence",
  "",
  "Historical BEFORE: " + pinned.before,
  "Documented defect: " + pinned.defect,
  "Proposed repair: " + pinned.repair,
  "",
  "All phases use synthetic Acme Valet / Main Garage fixtures. The original 63-pair evidence",
  "at ../issue-278-c-historical-evidence remains unchanged. New 320px variants have",
  "no historical baseline at that width. Screenshot acceptance remains Owner PENDING.",
  "",
  "| Case | Historic table y | Defective y | Proposed repair y | Remaining delta |",
  "|---|---|---|---|---|",
  ...rows.filter((item) => item.hasPinnedComparison).map((item) => "| " + item.caseName +
    " | " + item.tables.map((x) => x.before).join(", ") +
    " | " + item.tables.map((x) => x.defect).join(", ") +
    " | " + item.tables.map((x) => x.repaired).join(", ") +
    " | " + item.tables.map((x) => x.repairedDelta).join(", ") + " |"),
  "",
  "## Placement results",
  ...rows.map((item) => "- " + item.caseName + ": " +
    Object.entries(item.targets).map(([key, value]) => {
      const v = value;
      return key + " (x=" + round(v.x) + ", width=" + round(v.width) +
        ", initialX=" + v.initialX + ", clippedX=" + v.clippedX +
        ", controlsOverlapping=" + v.collision.length + ")";
    }).join("; ")),
  "",
  "## Owner gate",
  "Manual U-004 visual approval remains separate even if every programmatic geometry",
  "and functional test is green. Review the three-way index and identify any",
  "border-straddling Help chip or minor non-business geometry delta not accepted.",
];
writeFileSync(join(root, "U004-remediation-results.md"), md.join("\n"));
const escapeHtml = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const html = [
  "<!doctype html><html lang='en'><meta charset='utf-8'><title>VAYLET U004 repair evidence</title>",
  "<meta name='viewport' content='width=device-width,initial-scale=1'>",
  "<style>body{font:14px/1.5 system-ui;margin:24px;color:#16223c;background:#f6f8fb}",
  "details{margin:16px 0;padding:10px;background:white;border:1px solid #ddd;border-radius:8px}",
  "summary{font-weight:700;cursor:pointer}.images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}",
  "figure{margin:0;min-width:0}img{max-width:100%;height:auto;border:1px solid #ccc}",
  "@media(max-width:850px){.images{grid-template-columns:1fr}}</style>",
  "<h1>VAYLET U-004 — pinned BEFORE / defective ad72 / proposed repaired</h1>",
  "<p>BEFORE "+pinned.before+" — DEFECT "+pinned.defect+" — REPAIR "+escapeHtml(sha)+
    ". Synthetic fixtures, Owner visual acceptance pending.</p>",
  ...rows.map((row) => {
    const figures = ["before", "defect", "repair"].map((phase) => {
      const filename = phase+"/"+row.caseName+"/page.png";
      return existsSync(join(root, filename)) ?
        "<figure><figcaption>"+phase+"</figcaption><a href='"+encodeURI(filename)+
        "'><img loading='lazy' alt='"+escapeHtml(row.caseName+" "+phase)+
        "' src='"+encodeURI(filename)+"'></a></figure>" :
        "<figure><figcaption>"+phase+"</figcaption><p>No pinned baseline for new viewport.</p></figure>";
    }).join("");
    return "<details><summary>"+escapeHtml(row.caseName)+" — "+
      escapeHtml(row.tables.map((t) => t.repairedDelta).join(", "))+
      " CSS px table displacement</summary><div class='images'>"+figures+"</div></details>";
  }),
  "</html>",
].join("\n");
writeFileSync(join(root, "index.html"), html);
process.stdout.write("Cases: "+rows.length+"; pinned triples: "+
  rows.filter((r) => r.hasPinnedComparison).length+"\n"+
  "Index: "+join(root,"index.html")+"\n");
