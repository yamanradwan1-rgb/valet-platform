import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INTERNAL_RI_TRIGGER_SQL,
  assertInternalRiTriggers,
} from "./pg17-acceptance-internal-triggers.mjs";

const rows = () =>
  Array.from({ length: 23 }, (_, i) => {
    const common = {
      constraint_id: i + 1,
      constraint_name: `fixture_fk_${i}`,
      constraint_table: "auth_proof_private.operation_receipts",
      constraint_kind: "f",
      delete_action: "r",
      update_action: "r",
      referenced_schema: i < 7 ? "public" : "auth_proof_private",
      referenced_table:
        i < 7 ? "account_security_audit_events" : "operation_receipts",
      is_internal: true,
      enabled: "O",
    };
    const child = {
      trigger_schema: "auth_proof_private",
      trigger_table: "operation_receipts",
    };
    const referenced =
      i < 7
        ? {
            trigger_schema: "public",
            trigger_table: "account_security_audit_events",
          }
        : child;
    return [
      {
        ...common,
        ...child,
        trigger_name: `RI_ConstraintTrigger_c_${i}_1`,
        trigger_type: 5,
        handler: "RI_FKey_check_ins",
      },
      {
        ...common,
        ...child,
        trigger_name: `RI_ConstraintTrigger_c_${i}_2`,
        trigger_type: 17,
        handler: "RI_FKey_check_upd",
      },
      {
        ...common,
        ...referenced,
        trigger_name: `RI_ConstraintTrigger_a_${i}_1`,
        trigger_type: 9,
        handler: "RI_FKey_restrict_del",
      },
      {
        ...common,
        ...referenced,
        trigger_name: `RI_ConstraintTrigger_a_${i}_2`,
        trigger_type: 17,
        handler: "RI_FKey_restrict_upd",
      },
    ];
  }).flat();

test("all four RI guards for each of the 23 private FK constraints are required", () => {
  const original = rows();
  assert.equal(original.length, 92);
  assert.equal(assertInternalRiTriggers(original), true);
  assert.match(INTERNAL_RI_TRIGGER_SQL, /t\.tgconstraint=co\.oid/);
  assert.match(INTERNAL_RI_TRIGGER_SQL, /co\.contype='f'/);
  assert.equal(
    original.filter((row) => row.trigger_schema === "public").length,
    14,
  );
  for (const faulty of [original.slice(1), [...original, original[0]]]) {
    assert.throws(
      () => assertInternalRiTriggers(faulty),
      /INTERNAL_RI_TRIGGER_UNPROVEN/,
    );
  }
});

test("disabled or replaced single internal public/private FK trigger denies", () => {
  for (const target of [0, 2]) {
    for (const mutation of [
      { enabled: "D" },
      { enabled: "R" },
      { is_internal: false },
      { trigger_type: 1 },
      { handler: "public.noop" },
      { constraint_kind: "c" },
      { trigger_schema: "rogue" },
      { constraint_name: "other" },
      { delete_action: "a" },
      { update_action: "a" },
      { referenced_table: "other" },
      { handler: "RI_FKey_noaction_del" },
    ]) {
      const fixture = rows();
      fixture[target] = { ...fixture[target], ...mutation };
      assert.throws(
        () => assertInternalRiTriggers(fixture),
        /INTERNAL_RI_TRIGGER_UNPROVEN/,
        `${target}: ${JSON.stringify(mutation)}`,
      );
    }
  }
});
