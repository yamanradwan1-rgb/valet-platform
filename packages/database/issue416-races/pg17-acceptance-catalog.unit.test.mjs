import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCommittedExactLedger, assertPrivateAcl, migrationSourceChecksums,
} from "./pg17-acceptance-catalog.mjs";
import { executeAcceptanceCli } from "./pg17-acceptance-cli.mjs";

const fixtureRows = () => [...migrationSourceChecksums()].map(([migration_name, hashes]) => ({
  migration_name, checksum: [...hashes][0], finished_at: new Date(),
  started_at: new Date(), rolled_back_at: null, applied_steps_count: 1,
}));
const safeAcl = () => ({
  schema_name: "auth_proof_private", table_name: "authority_admissions",
  insert_allowed: false, update_allowed: false, delete_allowed: false,
  truncate_allowed: false, column_insert_allowed: false,
  column_update_allowed: false, public_write_allowed: false,
  owner_membership: false, public_column_write_allowed: false,
});
const safeFunction = () => ({
  signature: "auth_proof_private.protected_function()", runtime_execute: false,
  public_execute: false,
});

test("source-only migration manifest checks local reviewed bytes", () => {
  const hashes = migrationSourceChecksums();
  assert.ok(hashes.size >= 19);
  assert.ok([...hashes.keys()].filter((name) => name.includes("issue416")).length >= 19);
  assert.equal(assertCommittedExactLedger(fixtureRows()), hashes.size);
  const sourceOnly = hashes;
  for (const mutation of [
    (rows) => rows.pop(),
    (rows) => rows.push({ ...rows[0] }),
    (rows) => { rows[0].finished_at = null; },
    (rows) => { rows[0].rolled_back_at = new Date(); },
    (rows) => { rows[0].checksum = "tampered"; },
    (rows) => { rows[0].migration_name = "20261113011400_issue416_other"; },
    (rows) => { rows[0].applied_steps_count = 0; },
  ]) {
    const rows = fixtureRows();
    mutation(rows);
    assert.throws(() => assertCommittedExactLedger(rows, sourceOnly), /W30_PG17_/);
  }
});

test("runtime table privileges, public privileges and private EXECUTE must all deny", () => {
  assert.equal(assertPrivateAcl([safeAcl()], [safeFunction()]), true);
  for (const key of [
    "insert_allowed", "update_allowed", "delete_allowed", "truncate_allowed",
    "column_insert_allowed", "column_update_allowed", "public_write_allowed",
    "owner_membership", "public_column_write_allowed",
  ]) {
    assert.throws(() => assertPrivateAcl([{ ...safeAcl(), [key]: true }], [safeFunction()]), /ACL_UNPROVEN/);
  }
  assert.throws(() => assertPrivateAcl([], [safeFunction()]), /ACL_UNPROVEN/);
  assert.throws(() => assertPrivateAcl([safeAcl()], [{ ...safeFunction(), public_execute: true }]), /ACL_UNPROVEN/);
  assert.throws(() => assertPrivateAcl([safeAcl()], [{ ...safeFunction(), runtime_execute: true }]), /ACL_UNPROVEN/);
});

test("CLI status exposes zero execution and rejects claimed full acceptance", async () => {
  assert.match(await executeAcceptanceCli(["--status"]), /0 PG17 domain cases executed/);
  assert.match(await executeAcceptanceCli(["--source-check"]), /0 domain executed/);
  await assert.rejects(executeAcceptanceCli(["--execute"]), /DOMAIN_EXECUTION_NOT_BOUND/);
  await assert.rejects(executeAcceptanceCli(["--smoke", "--execute"]), /UNKNOWN_MODE/);
});
