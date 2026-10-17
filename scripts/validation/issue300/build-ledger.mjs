import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// This script never opens a DB, starts a server, or changes production files.
const root = resolve(import.meta.dirname, "../../..");
const planPath = resolve(root, "docs/plans/ISSUE_300_AUDIT_INVESTIGATION_MASTER_PLAN.md");
const ledgerPath = resolve(root, "docs/validation/issue300/T01-T70_ACCEPTANCE_LEDGER.md");
const plan = readFileSync(planPath, "utf8");
const section = plan.split("## 27. Testing and Acceptance Matrix")[1]?.split("## 28.")[0];
if (!section) throw Error("Issue #300 §27 missing; refuse ledger generation");

const rows = [...section.matchAll(/^\| (T\d{2}) \| ([^\n|]+) \| ([^\n|]+) \|\s*$/gm)]
  .map((match) => ({
    id: match[1],
    criterion: match[2].replaceAll("\`", "`").trim(),
    owners: match[3].trim(),
  }));
if (rows.length !== 70 || rows.some((row, i) => row.id !== `T${String(i + 1).padStart(2, "0")}`)) {
  throw Error(`Expected ordered T01–T70, got ${rows.map((row) => row.id).join(",")}`);
}

function lane(n) {
  if (n <= 40) return "Writer/DB/oracle + scoped HTTP";
  if (n <= 44) return "Two-connection PG snapshot race";
  if (n <= 55) return "HTTP authorization/privacy + PG";
  if (n <= 61) return "G2 browser/regression/HTTP";
  if (n <= 65) return "Owned PG load/migration";
  return "Failure injection/contract/HTTP";
}

const content = [
  "# Issue #300 — Independent T01–T70 Acceptance Ledger",
  "",
  "**Owner:** Worker 7 (independent QA). **Base SHA:** `2f1311575507eae06c6166270e748687762fb508`.",
  "**Status:** 70 GAP at design stage. No G2 candidate, authorized task-owned Postgres lease,",
  "or actual-writer/HTTP/browser acceptance execution has been supplied to W7 yet.",
  "The Prime's rejected disposable PG17 attempt on port 55430 is a resource blocker,",
  "not a failed feature test. No use of shared `valet` / port 5432 is authorized.",
  "",
  "Evidence taxonomy: `ORACLE` = independent fixed expected facts; `STATIC` = read-only",
  "source/manifest; `UNIT` = module; `DB` = real PostgreSQL; `WRITER` = real domain",
  "writer; `HTTP` = real guarded endpoint; `BROWSER` = real connected page;",
  "`LOAD` = measured PostgreSQL query/writer contention; `CI` = observed pipeline.",
  "A passing ORACLE or STATIC check never changes an unexecuted DB/HTTP item to PASS.",
  "",
  "## Execution gates",
  "",
  "- **G0 (STATIC):** Verify all 124 frozen SHA entries with `verify-frozen-ui.mjs` on the exact G2 candidate.",
  "- **G1:** Record Prime's frozen DTO/guard signatures, source writer map, approved migration decision and SHAs.",
  "- **G2:** Freeze candidate and HTTP/UI runtime identities; do not test a different worktree or mock endpoint.",
  "- **PG lease:** Prime supplies proof of separate DB/cluster ownership, database name, port, session/user, exclusive window, cleanup authority; DB tests then run.",
  "- **G3:** Attach per-row command, exit code, writer/fixture distinction, snapshot and evidence path. No implicit PASS.",
  "",
  "## T01–T70",
  "",
  "| ID | Criterion (§27, verbatim) | Owners | Independent evidence lane | Result | Evidence / blocker |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map((row, i) => {
    const n = i + 1;
    return `| ${row.id} | ${row.criterion.replaceAll("|", "\\|")} | ${row.owners} | ${lane(n)} | **GAP** | G2 + owned runtime pending; §27 ${row.id} |`;
  }),
  "",
  "## Status changes",
  "",
  "A row may advance to **PASS** only with a retained evidence file referencing",
  "the exact tested SHA and runtime identity, commands/results, and proof level.",
  "**FAIL** requires a reproducible observed contract violation. A blocked/unrun",
  "scenario remains **GAP**, even when static references suggest correct behavior.",
  "Never use test-only fixture authorization as evidence of production MFA or grant semantics.",
  "",
];
const rendered = content.join("\n");
if (process.argv.includes("--write")) {
  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, rendered, "utf8");
  console.log(`Wrote ${rows.length} GAP rows: ${ledgerPath}`);
} else {
  const existing = readFileSync(ledgerPath, "utf8");
  if (existing.replace(/\r\n/g, "\n") !== rendered) {
    throw Error("Ledger is stale or has changed; update only by explicit review");
  }
  console.log(`PASS: ${rows.length} ordered acceptance rows match §27`);
}
