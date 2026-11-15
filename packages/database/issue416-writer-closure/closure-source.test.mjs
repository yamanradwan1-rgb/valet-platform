import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { ids, loadCatalog, requiredVariants } from "./catalog.mjs";
import { analyze, evaluate } from "./check.mjs";
import { inspectProvisioner } from "./source-inspect.mjs";
import { definedProofFunctions, sqlCode } from "./sql-contract.mjs";

const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const catalogPath = "docs/plans/issue-416-option-a-writer-inventory.md";
const inventory = readFileSync(join(repo, catalogPath), "utf8");

function withFixture(files, callback) {
  const base = mkdtempSync(join(tmpdir(), "issue416-writer-closure-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const dest = join(base, path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
    return callback(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("precisely inventories all 35 families and excludes read-only/maintenance/operator", () => {
  const catalog = loadCatalog(repo);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(
    catalog.rows.map((row) => row.id),
    ids,
  );
  for (const id of ["A10", "A11", "M07", "R01"]) {
    assert.equal(catalog.rows.find((row) => row.id === id).class, "READ_GUARD");
  }
  assert.equal(
    catalog.rows.find((row) => row.id === "X01").class,
    "AUTHENTICATED_WRITER",
  );
  assert.equal(
    catalog.rows.filter((row) => row.class === "AUTHENTICATED_WRITER").length,
    23,
  );
  assert.equal(requiredVariants("M08").length, 7);
  assert.equal(requiredVariants("M09").length, 12);
});

test("removed, duplicate, or newly added writer family is not silently accepted", () => {
  const lines = inventory.split("\n");
  const missing = lines.filter(
    (line) => !line.startsWith("| **X01 staff_shift_force_end**"),
  );
  const duplicated = [...lines];
  duplicated.splice(
    63,
    0,
    lines.find((line) => line.startsWith("| **A01 ")),
  );
  const extra = inventory.replace(
    "## 4. SQL function/provisioning closure manifest",
    "| **A12 INVENTED_WRITE** | fake | fake |\n\n## 4. SQL function/provisioning closure manifest",
  );
  for (const [content, code] of [
    [missing.join("\n"), "INVENTORY_ROW_MISSING_OR_DUPLICATE"],
    [duplicated.join("\n"), "INVENTORY_ROW_MISSING_OR_DUPLICATE"],
    [extra, "UNEXPECTED_INVENTORY_WRITER"],
  ]) {
    withFixture({ [catalogPath]: content }, (base) => {
      assert.ok(
        loadCatalog(base).problems.some((problem) => problem.code === code),
      );
    });
  }
});

test("SQL lexer ignores comments and dollar function bodies as fake writer definitions", () => {
  const text = [
    "-- CREATE FUNCTION public.vap1_prepare_fake(uuid) RETURNS void",
    "/* CREATE FUNCTION public.vap1_execute_fake() */",
    "CREATE FUNCTION public.some_other() RETURNS void AS $$",
    " CREATE FUNCTION public.vap1_execute_fake() RETURNS void;",
    "$$ LANGUAGE plpgsql;",
    "CREATE FUNCTION public.vap1_prepare_real(uuid) RETURNS void AS 'select 1' LANGUAGE sql;",
  ].join("\n");
  assert.deepEqual(
    definedProofFunctions(text).map((item) => item.name),
    ["vap1_prepare_real"],
  );
  assert.doesNotMatch(sqlCode(text), /vap1_execute_fake/);
  assert.throws(() => sqlCode("/* never closed"), /SQL_UNTERMINATED_COMMENT/);
  assert.throws(
    () => sqlCode("SELECT $$never closed"),
    /SQL_UNTERMINATED_DOLLAR_BODY/,
  );
});

test("AST follows imported nested provisioning, catches write grants, and rejects dynamic SQL", () => {
  const root = "packages/database/scripts/";
  const modules = {
    [root + "provision-runtime-role.mjs"]: [
      'import { provisionMfaPrivileges } from "./mfa-runtime-privileges.mjs";',
      "async function provisionRuntimeRole() { await provisionMfaPrivileges(); }",
      "await provisionRuntimeRole();",
    ].join("\n"),
    [root + "mfa-runtime-privileges.mjs"]: [
      'import { grantWeak } from "./staff-management-runtime-privileges.mjs";',
      "export async function provisionMfaPrivileges() { await grantWeak(); }",
    ].join("\n"),
    [root + "staff-management-runtime-privileges.mjs"]: [
      "export async function grantWeak() {",
      '  await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [unsafe]);',
      '  await executeFormatted(client, "GRANT UPDATE (state) ON TABLE staff_auth_sessions TO %I", [role]);',
      '  await executeFormatted(client, "GRANT ALL ON TABLE staff_auth_sessions TO %I", [role]);',
      "  await client.query(dynamicSql);",
      "}",
    ].join("\n"),
  };
  withFixture(modules, (base) => {
    const report = inspectProvisioner(base);
    assert.equal(report.securityGrants.length, 3);
    assert.ok(report.securityGrants.every((grant) => grant.chain.length >= 3));
    assert.ok(
      report.problems.some(
        (problem) => problem.code === "NONSTATIC_PROVISIONER_SQL",
      ),
    );
    assert.ok(
      report.problems.some(
        (problem) => problem.code === "UNRESOLVED_EXPECTED_PROVISIONER_EDGE",
      ),
    );
  });
});

test("real source is BLOCKED with nested X01 legacy EXECUTE and sensitive MFA grants", () => {
  const analysis = analyze(repo);
  const outcome = evaluate(analysis);
  assert.equal(outcome.verdict, "BLOCKED");
  assert.equal(outcome.inspected.inventoried, 35);
  assert.equal(outcome.inspected.legacyFunctionSignatures, 27);
  assert.equal(outcome.inspected.parsedSqlProofFunctions, 0);
  assert.equal(
    analysis.legacy.signatures.find((entry) => entry.family === "X01")
      ?.signature,
    "public.staff_shift_force_end(uuid,uuid,text,uuid,uuid,uuid,text,text,text)",
  );
  const force = analysis.source.reachable.find((path) =>
    path.at(-1).endsWith("provisionStaffManagementPrivileges"),
  );
  assert.ok(
    force?.some((entry) => entry.includes("provisionShiftForceEndPrivileges")),
  );
  assert.ok(
    force?.some((entry) =>
      entry.includes("provisionStaffOnboardingPrivileges"),
    ),
  );
  assert.ok(
    outcome.reasons.some(
      (reason) => reason.code === "LEGACY_OR_UNCLASSIFIED_TABLE_WRITE_GRANT",
    ),
  );
  assert.ok(
    outcome.reasons.some(
      (reason) => reason.code === "NO_INDEPENDENT_SIGNED_PG17_CLOSURE_EVIDENCE",
    ),
  );
  assert.ok(
    outcome.reasons.some(
      (reason) =>
        reason.code ===
        "ACTUAL_PG17_ACL_AND_CUTOVER_NOT_VERIFIED_BY_SOURCE_DIAGNOSTIC",
    ),
  );
});
