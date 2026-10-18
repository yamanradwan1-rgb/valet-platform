import assert from "node:assert/strict";
import { test } from "node:test";
import { buildV2HelperSql, expectedLedgerFromSource } from "./issue300-r2-v2-ledger-helper.mjs";
import { attestV2LedgerHelper } from "./issue300-r2-v2-ledger-issuer.mjs";

const plan = buildV2HelperSql(expectedLedgerFromSource());
const valid = {
  body: plan.ddl.split("$issue300_r2_v2_ledger$")[1],
  fingerprint: "f".repeat(64),
  owner: "issue300_r2_w7_owner_v2",
  language: "sql",
  security_definer: true,
  volatility: "s",
  configuration: ["search_path=pg_catalog, pg_temp"],
  argument_count: 0,
  text_result: true,
  exclusive_execute: true,
  runtime_execute: true,
  no_ledger_select: true,
};

function stub(catalog = valid, runtimeValid = true, liveDigest = plan.expectedDigest) {
  const steps = [];
  const admin = { query: async (sql, params) => {
    steps.push("catalog");
    assert.match(sql, /pg_catalog\.pg_get_functiondef/);
    assert.match(sql, /pg_catalog\.aclexplode/);
    assert.match(sql, /prosrc AS body/);
    assert.deepEqual(params, [
      "issue300_r2_w7_runtime_v2",
      "public.issue300_r2_v2_migration_ledger_sha256()",
    ]);
    return catalog ? { rowCount: 1, rows: [catalog] } : { rowCount: 0, rows: [] };
  } };
  const runtime = { query: async (sql) => {
    if (sql.includes("current_database()")) {
      steps.push("role");
      return { rowCount: 1, rows: [{ valid: runtimeValid }] };
    }
    steps.push("invoke");
    assert.match(sql, /SELECT public\.issue300_r2_v2_migration_ledger_sha256\(\)/);
    return { rowCount: 1, rows: [{ digest: liveDigest }] };
  } };
  return { admin, runtime, steps };
}

test("accepts reviewed live helper and runtime ledger digest in strict order", async () => {
  const { admin, runtime, steps } = stub();
  assert.equal(await attestV2LedgerHelper(
    admin, runtime, plan.expectedDigest), valid.fingerprint);
  assert.deepEqual(steps, ["catalog", "role", "invoke"]);
});

test("rejects mismatched signed source before catalog read", async () => {
  const { admin, runtime, steps } = stub();
  await assert.rejects(attestV2LedgerHelper(admin, runtime, "0".repeat(64)),
    /V2_LEDGER_SOURCE_MISMATCH/);
  assert.deepEqual(steps, []);
});

test("rejects every altered catalog security property before privileged invocation", async () => {
  for (const change of [
    { body: "SELECT 'forged'" }, { owner: "postgres" },
    { language: "plpgsql" }, { security_definer: false },
    { volatility: "v" }, { configuration: ["search_path=public"] },
    { configuration: null }, { argument_count: 1 }, { text_result: false },
    { exclusive_execute: false }, { runtime_execute: false },
    { no_ledger_select: false }, { fingerprint: null },
  ]) {
    const { admin, runtime, steps } = stub({ ...valid, ...change });
    await assert.rejects(attestV2LedgerHelper(admin, runtime, plan.expectedDigest));
    assert.deepEqual(steps, ["catalog"], JSON.stringify(change));
  }
});

test("rejects missing helper, runtime role mismatch and ledger drift", async () => {
  const missing = stub(null);
  await assert.rejects(attestV2LedgerHelper(
    missing.admin, missing.runtime, plan.expectedDigest));
  assert.deepEqual(missing.steps, ["catalog"]);
  const wrongRole = stub(valid, false);
  await assert.rejects(attestV2LedgerHelper(
    wrongRole.admin, wrongRole.runtime, plan.expectedDigest));
  assert.deepEqual(wrongRole.steps, ["catalog", "role"]);
  const changedLedger = stub(valid, true, "a".repeat(64));
  await assert.rejects(attestV2LedgerHelper(
    changedLedger.admin, changedLedger.runtime, plan.expectedDigest),
  /V2_LEDGER_LIVE_MISMATCH/);
  assert.deepEqual(changedLedger.steps, ["catalog", "role", "invoke"]);
});

test("rejects a named third-party EXECUTE grantee before SECURITY DEFINER call", async () => {
  const extraNamedRole = stub({ ...valid, exclusive_execute: false });
  await assert.rejects(attestV2LedgerHelper(
    extraNamedRole.admin, extraNamedRole.runtime, plan.expectedDigest),
  /V2_LEDGER_HELPER_CATALOG_UNTRUSTED/);
  assert.deepEqual(extraNamedRole.steps, ["catalog"]);
});
