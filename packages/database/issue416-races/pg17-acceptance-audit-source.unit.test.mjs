import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FUNCTION_BODY_SQL,
  FUNCTION_BODY_PIN,
  assertPinnedFunctionBodies,
  functionBodiesDigest,
} from "./pg17-acceptance-function-source.mjs";
import {
  PUBLIC_AUDIT_TRIGGER_SQL,
  assertPublicAuditTriggers,
} from "./pg17-acceptance-public-audit.mjs";

const audit = () => [
  {
    schema_name: "public",
    table_name: "account_security_audit_events",
    trigger_name: "issue416_a01_audit_immutable",
    enabled: "O",
    is_internal: false,
    trigger_type: 31,
    deferrable: false,
    initially_deferred: false,
    handler: "auth_proof_private.guard_a01_audit_mutation",
    handler_kind: "f",
    handler_args: 0,
    trigger_definition:
      "CREATE TRIGGER issue416_a01_audit_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.account_security_audit_events FOR EACH ROW EXECUTE FUNCTION auth_proof_private.guard_a01_audit_mutation()",
  },
  {
    schema_name: "public",
    table_name: "account_security_audit_events",
    trigger_name: "issue416_a01_audit_receipt_complete",
    enabled: "O",
    is_internal: false,
    trigger_type: 5,
    deferrable: true,
    initially_deferred: true,
    handler: "auth_proof_private.assert_a01_audit_receipt",
    handler_kind: "f",
    handler_args: 0,
    trigger_definition:
      "CREATE CONSTRAINT TRIGGER issue416_a01_audit_receipt_complete AFTER INSERT ON public.account_security_audit_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((new.event_type = 'STAFF_LOGIN_SESSION_CREATED'::text)) EXECUTE FUNCTION auth_proof_private.assert_a01_audit_receipt()",
  },
];

test("both public A01 audit guards remain enabled, correctly timed and deferred", () => {
  assert.equal(assertPublicAuditTriggers(audit()), true);
  assert.match(PUBLIC_AUDIT_TRIGGER_SQL, /pg_get_triggerdef/);
  assert.match(PUBLIC_AUDIT_TRIGGER_SQL, /NOT t\.tgisinternal/);
  assert.doesNotMatch(PUBLIC_AUDIT_TRIGGER_SQL, /t\.tgname LIKE/);
  for (const mutated of [
    audit().slice(0, 1),
    [{ ...audit()[0], trigger_type: 5 }, audit()[1]],
    [{ ...audit()[0], enabled: "D" }, audit()[1]],
    [audit()[0], { ...audit()[1], initially_deferred: false }],
    [
      audit()[0],
      { ...audit()[1], trigger_definition: "removed WHEN predicate" },
    ],
    [{ ...audit()[0], trigger_definition: "CREATE TRIGGER no_op" }, audit()[1]],
    [...audit(), { ...audit()[0], trigger_name: "zz_inject_event_rewriter" }],
  ]) {
    assert.throws(
      () => assertPublicAuditTriggers(mutated),
      /AUDIT_TRIGGERS_UNPROVEN/,
    );
  }
});

test("private function definitions cannot be replaced while retaining ABI", () => {
  assert.equal(FUNCTION_BODY_PIN.count, 61);
  assert.match(FUNCTION_BODY_PIN.sha256, /^[0-9a-f]{64}$/);
  assert.match(FUNCTION_BODY_SQL, /pg_get_functiondef\(p\.oid\)/);
  const rows = [
    {
      signature: "auth_proof_private.guard(text)",
      function_kind: "f",
      function_owner: "vap1_proof_owner",
      function_definition: "SELECT 1;",
    },
  ];
  const original = functionBodiesDigest(rows);
  assert.notEqual(
    original,
    functionBodiesDigest([{ ...rows[0], function_definition: "SELECT 2;" }]),
  );
  assert.throws(
    () => assertPinnedFunctionBodies(rows),
    /BODY_MANIFEST_UNPROVEN/,
  );
  assert.throws(() => functionBodiesDigest([{}]), /BODY_INCOMPLETE/);
});
