import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ids = Object.freeze([
  ...Array.from({ length: 11 }, (_, i) => "A" + String(i + 1).padStart(2, "0")),
  ...Array.from({ length: 15 }, (_, i) => "M" + String(i + 1).padStart(2, "0")),
  ...Array.from({ length: 5 }, (_, i) => "P" + String(i + 1).padStart(2, "0")),
  ...Array.from({ length: 3 }, (_, i) => "R" + String(i + 1).padStart(2, "0")),
  "X01",
]);

const readGuards = new Set(["A10", "A11", "M07", "R01"]);
const maintenance = new Set(["M13", "P05"]);
const operators = new Set(["M14", "M15", "P01", "P02"]);
const nonProduction = new Set(["P03", "P04"]);
const variants = Object.freeze({
  A02: ["ROTATE", "CONSUMED_REPLAY_REVOKE"],
  A04: ["BEGIN", "SAME_SESSION_RESUME"],
  M08: [
    "CREATE",
    "ACTIVATE",
    "STOP_INTAKE",
    "RESUME_INTAKE",
    "DEACTIVATE",
    "CORRECT_CURRENCY",
    "CORRECT_TIMEZONE",
  ],
  M09: [
    "COMPANY_SCALAR",
    "LOCATION_SCALAR",
    "CLEAR_LOCATION_SCALAR",
    "COMPANY_HOURS",
    "CLEAR_COMPANY_HOURS",
    "LOCATION_HOURS",
    "CLEAR_LOCATION_HOURS",
    "LOCATION_SLA",
    "CLEAR_LOCATION_SLA",
    "COMPANY_BRANDING",
    "LOCATION_BRANDING",
    "CLEAR_LOCATION_BRANDING",
  ],
  M11: ["REGISTER", "CONFIRM", "SUPERSEDE"],
  M13: ["DELIVERY", "STALE_MAINTENANCE"],
  P02: ["ORGANIZATION_STATUS", "SUBSCRIPTION_ENTITLEMENT"],
  P03: ["DEMO_PASSWORD", "LOCAL_AUTH_STATE_RESET"],
  P04: ["E2E_FIXTURE", "CAPACITY_FIXTURE"],
});

export function requiredVariants(id) {
  return variants[id] ?? ["STANDARD"];
}

export function writerClass(id) {
  if (readGuards.has(id)) return "READ_GUARD";
  if (maintenance.has(id)) return "BOUNDED_MAINTENANCE";
  if (operators.has(id)) return "CONTROLLED_OPERATOR";
  if (nonProduction.has(id)) return "NONPRODUCTION_ONLY";
  return "AUTHENTICATED_WRITER";
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function loadCatalog(repo) {
  const path = join(repo, "docs/plans/issue-416-option-a-writer-inventory.md");
  const lines = readFileSync(path, "utf8").replaceAll("\r\n", "\n").split("\n");
  const rows = [];
  const problems = [];
  const start = lines.findIndex((line) => /^## 2\. /.test(line));
  const end = lines.findIndex((line) => /^## 4\. /.test(line));
  const xStart = lines.findIndex((line) => /^### 8\.3a /.test(line));
  const xEnd = lines.findIndex((line) => /^### 8\.4 /.test(line));
  if (
    [start, end, xStart, xEnd].some((index) => index < 0) ||
    start >= end ||
    xStart >= xEnd
  ) {
    problems.push({ code: "INVENTORY_SECTION_BOUNDARY_MISSING" });
  }
  const inventoryRows = lines.flatMap((line, index) => {
    const relevant =
      (index > start && index < end) || (index > xStart && index < xEnd);
    const match =
      relevant && line.match(/^\| \*\*([AMPRX]\d{2})\s+([^*]+)\*\* \|/);
    return match
      ? [{ id: match[1], line, number: index + 1, name: match[2].trim() }]
      : [];
  });
  for (const found of inventoryRows) {
    if (!ids.includes(found.id)) {
      problems.push({
        code: "UNEXPECTED_INVENTORY_WRITER",
        id: found.id,
        number: found.number,
      });
    }
  }
  for (const id of ids) {
    const matches = inventoryRows.filter((row) => row.id === id);
    if (matches.length !== 1) {
      problems.push({
        code: "INVENTORY_ROW_MISSING_OR_DUPLICATE",
        id,
        count: matches.length,
      });
      continue;
    }
    const { line, number, name } = matches[0];
    if ((line.match(/\|/g)?.length ?? 0) < 4) {
      problems.push({ code: "INVENTORY_ROW_MALFORMED", id, number });
    }
    rows.push({
      id,
      purpose: name,
      class: writerClass(id),
      line: number,
      digest: sha256(line),
    });
  }
  return {
    rows,
    problems,
    digest: sha256(
      JSON.stringify(
        rows.map(({ id, purpose, class: kind, digest }) => ({
          id,
          purpose,
          class: kind,
          digest,
        })),
      ),
    ),
  };
}
