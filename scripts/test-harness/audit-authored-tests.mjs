import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanAuthoredSource } from "./audit-authored-tests-source.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const testFilePattern = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i;
const columns = [
  "path",
  "line",
  "suite",
  "title",
  "kind",
  "expansion",
  "declared_rows",
  "ci_lane",
  "review_state",
  "source_signals",
];
const fileColumns = [
  "path",
  "ci_lane",
  "static_case_declarations",
  "dynamic_declarations",
  "suite_declarations",
  "parse_diagnostics",
  "source_signals",
  "review_state",
  "evidence_level",
];

function gitPaths() {
  const outcome = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (outcome.status !== 0) {
    throw new Error(`git ls-files failed: ${outcome.stderr}`);
  }
  return outcome.stdout
    .split("\0")
    .filter((p) => testFilePattern.test(p))
    .sort();
}

function existingLaneLookup() {
  const mapping = new Map();
  const csv = readFileSync(
    join(root, "docs/quality/CIQ_TEST_FILE_INVENTORY_20261103.csv"),
    "utf8",
  );
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const fields = [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((match) =>
      match[1].replace(/""/g, '"'),
    );
    if (fields.length >= 3) mapping.set(fields[0], fields[2]);
  }
  return mapping;
}

function csv(rows, headers) {
  const cells = (row) =>
    headers
      .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
      .join(",");
  return (
    [headers.map((header) => `"${header}"`).join(","), ...rows.map(cells)].join(
      "\n",
    ) + "\n"
  );
}

function groupCounts(files, key) {
  const grouped = new Map();
  for (const file of files)
    grouped.set(file[key], (grouped.get(file[key]) ?? 0) + 1);
  return [...grouped].sort((a, b) => b[1] - a[1]);
}

export function buildInventory() {
  const lanes = existingLaneLookup();
  const caseRows = [],
    fileRows = [];
  const paths = gitPaths();
  for (const path of paths) {
    const parsed = scanAuthoredSource(
      path,
      readFileSync(join(root, path), "utf8"),
    );
    const ci_lane = lanes.get(path) ?? "NOT_IN_PREVIOUS_FILE_INVENTORY";
    const dynamic_declarations = parsed.tests.filter((test) =>
      test.expansion.startsWith("dynamic"),
    ).length;
    fileRows.push({
      path,
      ci_lane,
      static_case_declarations: parsed.tests.length,
      dynamic_declarations,
      suite_declarations: parsed.suiteDeclarations,
      parse_diagnostics: parsed.parseDiagnostics,
      source_signals: parsed.sourceSignals,
      review_state: "NOT_SEMANTICALLY_REVIEWED",
      evidence_level: "STATIC_AST_DECLARATIONS_NOT_RUNTIME_CASES",
    });
    for (const test of parsed.tests) {
      caseRows.push({
        path,
        line: test.line,
        suite: test.suite,
        title: test.title,
        kind: test.identifier,
        expansion: test.expansion,
        declared_rows: test.declaredRows,
        ci_lane,
        review_state: "NOT_SEMANTICALLY_REVIEWED",
        source_signals: parsed.sourceSignals,
      });
    }
  }
  return { caseRows, fileRows };
}

function markdown({ caseRows, fileRows }, revision) {
  const totalDynamic = fileRows.reduce(
    (n, file) => n + file.dynamic_declarations,
    0,
  );
  const invalid = fileRows.filter((file) => file.parse_diagnostics !== 0);
  const withoutCalls = fileRows.filter(
    (file) => file.static_case_declarations === 0,
  );
  const laneLines = groupCounts(fileRows, "ci_lane")
    .map(([lane, count]) => `| ${lane.replace(/\|/g, "\\|")} | ${count} |`)
    .join("\n");
  return `# VAYLET Test Audit — Authored Test Declaration Registry

Immutable audit source: \`${revision}\`. This is an automatically generated **static AST inventory**, not a manual approval of every test's domain contract.

- Tracked test/spec files: **${fileRows.length}**.
- Authored test declarations: **${caseRows.length}** (some parameterized declarations expand to multiple runtime cases).
- Dynamic titles or dataset declarations: **${totalDynamic}**; these require real runner collection to measure case count.
- Files with no recognized direct test()/it()/specify() call: **${withoutCalls.length}** (possible generated tests, unusual runners, or helper-only naming).
- Files with TypeScript AST parse diagnostics: **${invalid.length}**; see the file ledger for exact paths.
- Every declaration and file is explicitly marked \`NOT_SEMANTICALLY_REVIEWED\` until a human/worker verifies its invariant and unique defect-detection value.

## Lane inventory
| Existing 2026-11-03 classifier annotation | Tracked files |
| --- | ---: |
${laneLines}

## Interpretation limits
1. Static case declarations are **not** live executed test instances; nested loops, data-driven \`test.each\`, generated test titles and setup callbacks may expand cases at runtime.
2. Source signals flag candidates only. A string assertion can be a binding user contract; a fixed request count can be a required anti-N+1 budget; a snapshot can be an approved UI freeze.
3. A file without direct cases is not automatically redundant or safe to remove.
4. The previous file inventory may be older than this SHA; mismatch is surfaced rather than hidden. CI ownership must be checked by the official classifier.
5. Required PostgreSQL/Issue215/tenant/Location/MFA/payment/custody/retry tests must not be skipped or deleted based only on a numeric risk score.
6. To claim exhaustive runtime cases, reconcile this registry against Vitest/Node/Playwright collection across all approved lanes and separately identify manual/private suites.
`;
}

function main() {
  // The audit is pinned to the immutable merge baseline even after committing
  // this inventory generator on its own independent audit branch.
  const revision = spawnSync("git", ["merge-base", "origin/main", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  if (revision.status !== 0) throw new Error(revision.stderr);
  const inventory = buildInventory();
  const directory = resolve(root, "docs/quality");
  mkdirSync(directory, { recursive: true });
  const output = [
    ["TA_ALL_TEST_DECLARATIONS_20261103.csv", csv(inventory.caseRows, columns)],
    ["TA_ALL_TEST_FILES_20261103.csv", csv(inventory.fileRows, fileColumns)],
    [
      "TA_ALL_TESTS_STATIC_SUMMARY_20261103.md",
      markdown(inventory, revision.stdout.trim()),
    ],
  ];
  const check = process.argv.includes("--check");
  for (const [filename, text] of output) {
    const path = join(directory, filename);
    if (check) {
      if (readFileSync(path, "utf8") !== text)
        throw new Error(`Inventory stale: ${filename}`);
    } else {
      writeFileSync(path, text, "utf8");
    }
  }
  console.log(
    JSON.stringify({
      files: inventory.fileRows.length,
      declarations: inventory.caseRows.length,
      dynamic: inventory.fileRows.reduce(
        (n, f) => n + f.dynamic_declarations,
        0,
      ),
      unparsed: inventory.fileRows.filter((f) => f.parse_diagnostics).length,
      withoutDirectCases: inventory.fileRows.filter(
        (f) => !f.static_case_declarations,
      ).length,
      check,
    }),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
