import assert from "node:assert/strict";
import test from "node:test";
import {
  WRITER_FAMILIES, RESERVED_SECURITY_AUDIT_EVENTS,
  assessWriterClosure, assessOldAuditorClosure,
} from "../writer-closure-contract.mjs";
import { evaluateL2Evidence, describeSafeL2Rehearsal,
} from "../cutover-plan.mjs";

const VERIFIED_SOURCE = "a".repeat(40);
const evidence = (row) => ({
  ...row, status: "VERIFIED", sourceSha: VERIFIED_SOURCE,
  evidenceRef: "synthetic-self-declared-contract-evidence",
  verifier: "synthetic",
});

test("U2 inventory has 35 distinct writer families, including X01", () => {
  assert.equal(WRITER_FAMILIES.length, 35);
  assert.equal(new Set(WRITER_FAMILIES.map((row) => row.id)).size, 35);
  for (const [prefix, count] of [
    ["A", 11], ["M", 15], ["P", 5], ["R", 3], ["X", 1],
  ]) {
    assert.equal(WRITER_FAMILIES.filter((row) =>
      row.id.startsWith(prefix)).length, count);
  }
});

test("read-only guards, operator writers and nonproduction paths are not signers", () => {
  const map = new Map(WRITER_FAMILIES.map((row) => [row.id, row.contract]));
  for (const id of ["A10", "A11", "M07", "R01"]) {
    assert.equal(map.get(id), "NONWRITING_CURRENT_AUTH_GUARD");
  }
  for (const id of ["M14", "M15", "P01", "P02"]) {
    assert.equal(map.get(id), "INDEPENDENT_OPERATOR_COMMAND");
  }
  for (const id of ["M13", "P05"]) {
    assert.equal(map.get(id), "BOUNDED_MAINTENANCE_NO_STAFF_SIGNER");
  }
  for (const id of ["P03", "P04"]) {
    assert.equal(map.get(id), "NONPRODUCTION_EXECUTION_DENIED");
  }
  assert.equal(map.get("X01"), "AUTHENTICATED_TYPED_WRITER");
});

test("none and incomplete writer evidence never close even one missing family", () => {
  const absent = assessWriterClosure([]);
  assert.equal(absent.declared, 0);
  assert.equal(absent.items.filter((row) => row.status === "BLOCKED").length, 35);
  const oneMissing = assessWriterClosure(WRITER_FAMILIES.slice(0, -1).map(evidence));
  assert.equal(oneMissing.declared, 34);
  assert.equal(oneMissing.items.find((row) =>
    row.id === "X01").status, "BLOCKED");
  assert.equal(oneMissing.canDeclareProductionClosure, false);
});

test("wrong family classification and repeated families fail even with labels", () => {
  const wrong = WRITER_FAMILIES.map(evidence);
  wrong[0] = { ...wrong[0], contract: "NONPRODUCTION_EXECUTION_DENIED" };
  const result = assessWriterClosure(wrong);
  assert.equal(result.items[0].status, "BLOCKED");
  assert.equal(result.canDeclareProductionClosure, false);
  const duplicate = assessWriterClosure([
    ...WRITER_FAMILIES.map(evidence), evidence(WRITER_FAMILIES[0]),
    evidence({ id: "UNKNOWN", contract: "AUTHENTICATED_TYPED_WRITER" }),
  ]);
  assert.equal(duplicate.unexpected.length, 2);
  assert.equal(duplicate.canDeclareProductionClosure, false);
});

test("self-declared evidence for all 35 writers is still not real SQL closure", () => {
  const result = assessWriterClosure(WRITER_FAMILIES.map(evidence));
  assert.equal(result.declared, 35);
  assert.equal(result.canDeclareProductionClosure, false);
  assert.equal(result.status, "SOURCE_INVENTORY_ONLY_NO_RELEASE_AUTHORITY");
});

test("all four MFA and two reset reserved auditor events remain explicit", () => {
  assert.deepEqual(RESERVED_SECURITY_AUDIT_EVENTS, [
    "MFA_TOTP_ACTIVATED", "MFA_RECOVERY_CODE_USED",
    "MFA_FACTOR_REENROLLMENT_STARTED", "MFA_RECOVERY_CODES_REISSUED",
    "STAFF_PASSWORD_RESET_LINK_ISSUED",
    "STAFF_PASSWORD_RESET_PASSWORD_CHANGED",
  ]);
  const missing = assessOldAuditorClosure({
    genericDeniedEventNames: RESERVED_SECURITY_AUDIT_EVENTS.slice(4),
    genericControlledOperatorActorDenied: true,
    authenticatedAtomicEventAppend: true, migration112Unchanged: true,
    legitimateGenericEventsPreserved: true,
    evidenceRef: "synthetic-review", verifier: "worker5",
  });
  assert.deepEqual(missing.missing, RESERVED_SECURITY_AUDIT_EVENTS.slice(0, 4));
  assert.equal(missing.status, "BLOCKED");
});

test("audit gate requires CONTROLLED_OPERATOR rejection and protects old migration112", () => {
  const complete = {
    genericDeniedEventNames: [...RESERVED_SECURITY_AUDIT_EVENTS],
    genericControlledOperatorActorDenied: true,
    authenticatedAtomicEventAppend: true, migration112Unchanged: true,
    legitimateGenericEventsPreserved: true,
    evidenceRef: "synthetic-auditor-proof", verifier: "worker5",
  };
  assert.equal(assessOldAuditorClosure({
    ...complete, genericControlledOperatorActorDenied: false,
  }).status, "BLOCKED");
  assert.equal(assessOldAuditorClosure({
    ...complete, migration112Unchanged: false,
  }).status, "BLOCKED");
  assert.equal(assessOldAuditorClosure({
    ...complete, genericDeniedEventNames: [...RESERVED_SECURITY_AUDIT_EVENTS,
      "MADE_UP_EVENT"],
  }).status, "BLOCKED");
  const selfClaim = assessOldAuditorClosure(complete);
  assert.equal(selfClaim.status, "DECLARED_NOT_ATTESTED");
  assert.equal(selfClaim.canDeclareProductionClosure, false);
  assert.equal(selfClaim.stillRequiresEffectivePgAclAndRuntimeSqlNegative, true);
});

test("L2 names writer, old auditor, quotas, external entitlement and P05 gates", () => {
  const named = evaluateL2Evidence({});
  for (const name of [
    "ALL_35_WRITER_FAMILIES_CLOSED",
    "LEGACY_SQL_EXECUTES_AND_OVERLOADS_DENIED",
    "OLD_GENERIC_AUDITOR_MFA_RESET_EVENTS_DENIED",
    "ANTI_ABUSE_COUNTED_IGNORED_FENCED",
    "EXTERNAL_ORG_ENTITLEMENT_WRITERS_ATTESTED",
    "P05_MAINTENANCE_AND_P03_P04_FIXTURES_FENCED",
  ]) {
    assert.ok(named.results.some((item) =>
      item.name === name && item.status === "BLOCKED"), name);
  }
  const rehearsal = describeSafeL2Rehearsal();
  assert.ok(rehearsal.steps.some((step) => step.includes("35")));
  assert.equal(named.canRunLiveCutover, false);
});
