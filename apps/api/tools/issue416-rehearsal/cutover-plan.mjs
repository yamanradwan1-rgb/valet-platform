// No I/O to PostgreSQL, Docker, staff APIs or secret stores.
// A plan showing all steps does not confer cutover/deployment authority.
export const CHECKPOINTS = Object.freeze(["C0", "C1", "C2", "C3",
  "C4", "C5", "C6"]);
const GATES = Object.freeze([
  "OWNER_L1_L2_U1_S1_APPROVAL",
  "W2_S1_AUTHENTICATED_WRITERS",
  "ALL_35_WRITER_FAMILIES_CLOSED",
  "LEGACY_SQL_EXECUTES_AND_OVERLOADS_DENIED",
  "OLD_GENERIC_AUDITOR_MFA_RESET_EVENTS_DENIED",
  "ANTI_ABUSE_COUNTED_IGNORED_FENCED",
  "EXTERNAL_ORG_ENTITLEMENT_WRITERS_ATTESTED",
  "P05_MAINTENANCE_AND_P03_P04_FIXTURES_FENCED",
  "ACTUAL_TOPOLOGY_AND_OPERATOR_INVENTORY",
  "PROOF_COMPATIBLE_N_AND_R",
  "REVOKED_OLD_MIGRATION_RUNNERS",
  "REAL_EFFECTIVE_ACL_AND_PROVISIONER_TWICE",
  "ISOLATED_OLDER_PHYSICAL_BACKUP_RESTORE",
  "EXTERNAL_MONOTONE_ADMISSION_DENY_LEDGER",
  "VERIFIED_KEY_ESCROW_ROTATION_AND_CANARIES",
  "PG17_TWO_CONNECTION_ADMISSION_RACES",
  "MEASURED_RPO_RTO_AND_CUSTODY_CONTINUITY",
  "INDEPENDENT_C0_C6_SIGNOFF",
]);

export function evaluateL2Evidence(evidence) {
  const results = GATES.map((name) => {
    const item = evidence?.[name];
    // Facts provided by the caller alone cannot attest a deployed environment.
    const passesShape = item?.status === "VERIFIED" &&
      typeof item?.reference === "string" && item.reference.length > 8 &&
      typeof item?.verifiedBy === "string" && item.verifiedBy.length > 3 &&
      Number.isSafeInteger(item?.observedAtMs) && item.observedAtMs > 0;
    return Object.freeze({ name, status: passesShape ?
      "EVIDENCE_PRESENT_UNVERIFIED" : "BLOCKED" });
  });
  return Object.freeze({
    status: "L2_EXECUTION_NOT_AUTHORIZED",
    canRunLiveCutover: false,
    canRunExistingQaOrProduction: false,
    results: Object.freeze(results),
    checkpointPlan: CHECKPOINTS,
  });
}

export function describeSafeL2Rehearsal() {
  return Object.freeze({
    status: "PLAN_ONLY_NOT_EXECUTED",
    environment: "NEW_DEDICATED_DOCKER_PG17_EXCLUSIVE_LEASE",
    steps: Object.freeze([
      "Validate docker labels, volume, image, port and distinct SQL roles",
      "Ensure all child env DB URLs match new disposable target",
      "Verify W2 schema and S1 typed protected writers on synthetic data",
      "Inspect all 35 U2 writer families; retire old SQL overloads and direct grants",
      "Deny generic MFA/reset audit-event forgery and unsafe quota discounting",
      "Fence P03/P04 fixtures, limit M13/P05 maintenance and attest external E writers",
      "Check admission S/X locks and HOLD-first/command-first COMMIT barriers",
      "Run old credential denial with old provisioner only before C6",
      "Verify new restricted provisioner twice and N/R compatibility",
      "Restore older encrypted physical backup in isolation",
      "Reapply independent deny ledger or keep stale ADMIT in HOLD",
      "Measure actual RPO/RTO without impersonating real Staff",
      "Record private evidence, then destroy only explicitly leased resources",
    ]),
  });
}
