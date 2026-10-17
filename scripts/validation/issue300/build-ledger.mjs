import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  if (existsSync(ledgerPath) &&
      readFileSync(ledgerPath, "utf8").replace(/\r\n/g, "\n") !== rendered) {
    throw Error("Refusing to overwrite reviewed G2 acceptance evidence with the design-stage GAP template");
  }
  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, rendered, "utf8");
  console.log(`Wrote ${rows.length} GAP rows: ${ledgerPath}`);
} else {
  const existing = readFileSync(ledgerPath, "utf8").replace(/\r\n/g, "\n");
  if (existing === rendered) {
    console.log(`PASS: ${rows.length} baseline GAP acceptance rows match §27`);
  } else {
    // G2 evidence may advance a row beyond the original all-GAP matrix. Do NOT
    // accept free-form edits: validate the original §27 criterion/owner/lane,
    // all 70 ordered IDs, explicit evidence classifications and a pinned code
    // candidate SHA. The original --write baseline initializer stays unchanged.
    const header = "| ID | Criterion (§27, verbatim) | Owners | Independent evidence lane | Result | Evidence / blocker | Exact command / execution | Code candidate SHA | Next action |";
    const parsedLines = existing.split("\n");
    if (!parsedLines.includes(header)) {
      throw Error("G2 acceptance ledger must retain explicit nine-column evidence headers");
    }
    const g2Rows = parsedLines.filter((line) => /^\| T\d{2} \|/.test(line));
    if (g2Rows.length !== rows.length) {
      throw Error(`Issue300 G2 ledger must contain 70 distinct ordered rows, got ${g2Rows.length}`);
    }
    const usedIds = new Set();
    const candidateShas = new Set();
    for (const [index, value] of g2Rows.entries()) {
      const cells = value.split("|").slice(1, -1).map((item) => item.trim());
      const expected = rows[index];
      if (cells.length !== 9 || cells[0] !== expected.id ||
          cells[1] !== expected.criterion || cells[2] !== expected.owners ||
          cells[3] !== lane(index + 1) || usedIds.has(cells[0])) {
        throw Error(`Issue300 G2 ledger diverges from binding §27 at ${expected.id}`);
      }
      usedIds.add(cells[0]);
      const isGap = cells[4] === "**GAP**";
      const isPass = /^\*\*PASS \(G2 SQL fixture \+ authenticated HTTP; criterion only\)\*\*$/.test(cells[4]);
      if (!isGap && !isPass) throw Error(`Unreviewed acceptance status ${expected.id}`);
      if (!cells[5] || !cells[6] || !cells[8] ||
          !/^[a-f0-9]{40}$/.test(cells[7])) {
        throw Error(`Missing explicit evidence, command, action or code SHA for ${expected.id}`);
      }
      candidateShas.add(cells[7]);
      if (isPass && (index + 1 !== 30 && index + 1 !== 32 ||
          !cells[5].includes("G2_RUNTIME_EVIDENCE.md") ||
          !cells[6].includes("issue300-pg-proof.mjs") ||
          !cells[6].includes("issue300-auth-http-proof.mjs"))) {
        throw Error(`Unsupported G2 PASS claim for ${expected.id}`);
      }
      if (isGap && !cells[8].includes("Run") &&
          !cells[8].includes("Execute")) {
        throw Error(`GAP ${expected.id} has no concrete next test action`);
      }
    }
    if (candidateShas.size !== 1 ||
        !existing.includes("68 full acceptance") ||
        !existing.includes("Overall Issue #300 is NOT ACCEPTED") ||
        !existing.includes("G2_RUNTIME_EVIDENCE.md")) {
      throw Error("G2 acceptance ledger lacks consistency or mandatory GAP disclosure");
    }
    console.log(`PASS: ${rows.length} G2 acceptance rows retain binding §27, traceable SHA/evidence, narrow T30/T32 PASS and remaining GAP`);
  }
}
