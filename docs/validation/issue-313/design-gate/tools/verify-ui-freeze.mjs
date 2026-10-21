import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const marker = "<!-- ISSUE313_FEEDBACK_SECTION -->";
const baseline = readFileSync(path.join(root, "baseline/current-analytics.html"), "utf8");
const pieces = baseline.split(marker);
if (pieces.length !== 2) throw new Error("Baseline must contain one insertion marker");
const options = [
  "option-1-summary-first.html",
  "option-2-insights-first.html",
  "option-3-history-first.html",
  "option-4-balanced.html",
];
let failures = 0;
for (const option of options) {
  try {
    const candidate = readFileSync(path.join(root, option), "utf8");
    const start = candidate.startsWith(pieces[0]);
    const end = candidate.endsWith(pieces[1]);
    const middle = start && end ? candidate.slice(pieces[0].length, candidate.length - pieces[1].length) : "";
    const featureCount = (middle.match(/data-testid=["']customer-feedback-section["']/g) ?? []).length;
    const scriptCount = (middle.match(/feedback-fixture\.js/g) ?? []).length;
    const result = start && end && featureCount === 1 && scriptCount === 1;
    console.log(`${result ? "PASS" : "FAIL"} ${option} — frozen prefix ${start}; suffix ${end}; feedback roots ${featureCount}; shared fixture references ${scriptCount}`);
    if (!result) failures++;
  } catch (error) {
    failures++;
    console.error(`FAIL ${option}: ${error.message}`);
  }
}
if (failures) process.exitCode = 1;
