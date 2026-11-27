// Source-only regression fences for the disposable P7 restore helper.
// No database, Docker, secrets, or application runtime is required.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const helper = readFileSync(new URL("./issue463-browser-restore-pg.ts", import.meta.url), "utf8");
const ledger = readFileSync(new URL("./issue463-browser-ledger-proof.ts", import.meta.url), "utf8");

test("P7 restore requires attested original absence before any dump or CREATE", () => {
  const cluster = helper.indexOf('SELECT system_identifier::text FROM pg_control_system()');
  const dbAbsent = helper.indexOf("SELECT count(*) FROM pg_database WHERE datname=");
  const archiveAbsent = helper.indexOf('docker(["test","!","-e",archive])');
  const dump = helper.indexOf('docker(["pg_dump"');
  const create = helper.indexOf('sql("CREATE DATABASE "');
  assert.ok(cluster >= 0 && cluster < dbAbsent);
  assert.ok(dbAbsent < archiveAbsent && archiveAbsent < dump && dump < create);
  assert.match(helper, /assertContainer\(target\.id,target\.owner\) !== target\.port/);
  assert.match(helper, /mUrl\.pathname !== "\/" \+ target\.database/);
  assert.match(helper, /eUrl\.pathname !== "\/" \+ target\.database/);
});

test("P7 cleanup independently attempts owned DB and dump removal", () => {
  const close = helper.slice(helper.indexOf("async function close()"),
    helper.indexOf("  try {\n    archiveAttempted = true"));
  assert.match(close, /Promise\.all\(\[endClient\(m\), endClient\(e\)\]\)/);
  assert.match(close, /if \(databaseAttempted\) \{[\s\S]*?DROP DATABASE IF EXISTS/);
  assert.match(close, /if \(archiveAttempted\) \{[\s\S]*?docker\(\["rm","-f",archive\]\)/);
  assert.match(close, /new AggregateError\(failures, "Issue463 restore cleanup incomplete\."\)/);
  assert.match(close, /cleaned = true/);
  assert.match(helper, /archiveAttempted = true; \/\/ pg_dump can leave a partial file/);
  assert.match(helper, /databaseAttempted = true; \/\/ CREATE may commit/);
});

test("bounded expiry sweep cannot certify residual due text", () => {
  const stage = helper.slice(helper.indexOf("async recomputeExpiredTextFromServerTime()"),
    helper.indexOf("    };\n    return { replayTarget"));
  assert.match(stage, /expire_guest_rating_comments\(100\)/);
  assert.match(stage, /state='PRESENT' AND retention_expires_at<=clock_timestamp\(\)/);
  assert.match(stage, /residual\.rows\[0\]\?\.due === false/);
  assert.match(stage, /: "UNKNOWN"/);
});

test("ledger closes A and E even if restored cleanup rejects", () => {
  assert.match(ledger, /finally \{\s*try \{ await restored\?\.close\(\); \}\s*finally \{ await Promise\.allSettled\(\[a\.end\(\), e\.end\(\)\]\); \}/);
});

test("restore remains limited to live approvals and exact case scope", () => {
  assert.match(helper, /Immediate \(within approval TTL\) backup\/restore/);
  assert.match(helper, /never bypasses E's expiry check/);
  assert.match(helper, /visit\.approvalId===scope\.approvalId/);
  assert.match(helper, /visit\.caseId===scope\.caseId/);
  assert.match(helper, /visit\.organizationId===scope\.organizationId/);
  assert.match(helper, /apply_guest_rating_comment_disposition\(\$1::uuid\)/);
  assert.match(helper, /REVOKE CONNECT ON DATABASE/);
  assert.match(helper, /runtime:false,connections:0/);
});
