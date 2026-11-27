// Source-only gate for the worker-owned final P7 helper: never runs SQL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const script=readFileSync(new URL(
  "../../../packages/database/scripts/issue463-p5-final-races.mjs",import.meta.url
),"utf8");
const executable=script.replace(/^\/\/[^\n]*$/gm,"");
test("Issue463 W10 helper reuses exactly P7 attestation and official P5_TEST",()=>{
  assert.match(script,/await assertP7SqlTarget\(env\)/);
  assert.match(script,/RATING_FEEDBACK_APPROVER_DATABASE_URL/);
  assert.match(script,/RATING_FEEDBACK_EXECUTOR_DATABASE_URL/);
  assert.match(script,/issue463_p7_runtime/);
  assert.match(script,/vaylet_rating_feedback_privacy_approver/);
  assert.match(script,/vaylet_rating_feedback_privacy_executor/);
  assert.doesNotMatch(script,/\bGRANT\s+(?:ALL|EXECUTE|USAGE|UPDATE|SELECT)\s+ON\b/i);
  assert.doesNotMatch(executable,/\b(?:CREATE\s+ROLE|DROP\s+ROLE|RELEASE)\b/i);
  assert.doesNotMatch(executable,/^\s*SET\s+ROLE\s+[a-z_]/im);
  assert.doesNotMatch(script,/\bpostgres(?:ql)?:\/\//i);
  assert.doesNotMatch(script,/\b(?:docker\s+(?:run|stop)|prisma\s+migrate)\b/i);
});
test("LK04 and PR05/LK07 cover real A/E transactions and both orders",()=>{
  for (const token of [
    "BEGIN","ROLLBACK","COMMIT","pg_blocking_pids",
    "approve_guest_rating_comment_disposition",
    "apply_guest_rating_comment_disposition",
    "reader-first","executor-first",
    "role='ORG_ADMIN'",
  ]) {
    assert.ok(script.includes(token),"missing scenario "+token);
  }
  assert.match(script,/\[0,"HOLD","reader-first"\]/);
  assert.match(script,/\[1,"HOLD","executor-first"\]/);
  assert.match(script,/\[2,"ERASE","reader-first"\]/);
  assert.match(script,/\[3,"ERASE","executor-first"\]/);
  assert.match(script,/\[a,b\]/);
});
