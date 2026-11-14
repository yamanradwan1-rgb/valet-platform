// W9 migration113 recovery was DENIED; a text flag or another agent's lease
// does not authorize this worker to access PostgreSQL or run fixture writes.
export const RACE_STATUS = "BLOCKED_PG17_NOT_RUN";
export const BLOCKER =
  "ISSUE416_W9_MIGRATION113_UNRESOLVED_AND_LEASE_NOT_ATTESTED";

export const REQUIRED_CAPABILITIES = Object.freeze([
  "committed-reviewed-migrations-through-current-head",
  "authentic-purpose-bound-VAP1-credential-signer",
  "two-distinct-connection-transaction-leases",
  "canonical-ranks-01-through-16-with-prepare-boundary",
  "runtime-public-inherited-role-ACL-denial",
  "L1-current-version-S-X-admission-gates",
  "domain-audit-receipt-atomic-commit",
  "independent-monotone-HOLD-checkpoint",
  "bounded-post-commit-new-lease-reconciliation",
  "pre-reserve-quota-before-domain-locks",
  "per-connection-independent-lease-owner-proof",
  "COMMIT-ack-drop-not-backend-precommit-kill",
  "operator-current-version-authority-and-readiness",
  "test-only-barriers-and-real-pg-lock-observer",
]);

export function raceReadiness() {
  return Object.freeze({
    status: RACE_STATUS,
    reason: BLOCKER,
    cases: 21,
    directions: 2,
    outcomes: ["C", "R", "D", "U", "T"],
    capabilitiesRequired: REQUIRED_CAPABILITIES,
    pg17Executed: false,
  });
}

// MUST be called before any client, Docker, Prisma, DDL, fixture or observer.
// There is deliberately no process.env escape hatch, approval token or URL.
export function assertRaceRuntimeAuthorized() {
  throw new Error(
    `${RACE_STATUS}: ${BLOCKER}; no SQL or fixture access permitted`,
  );
}

export function validateFuturePg17Observation(observed) {
  // Validation of a future attested observation's shape, not attestation itself.
  // A forged object can never authorize execution; the hard gate above wins.
  if (
    observed?.serverVersion < 170000 ||
    observed?.serverVersion >= 180000 ||
    !Number.isInteger(observed?.serverVersion) ||
    observed?.database !== "issue416_w9_db" ||
    observed?.databaseOwner !== "issue416_w9_owner" ||
    observed?.hostname !== "127.0.0.1" ||
    observed?.mappedPort !== 55416 ||
    observed?.postgresImage !== "postgres:17-alpine" ||
    observed?.inRecovery !== false ||
    observed?.isSuperuser !== false ||
    observed?.canBypassRls !== false ||
    observed?.canCreateRole !== false ||
    observed?.transactionIsolation !== "read committed" ||
    observed?.lockTimeoutMs !== 2000 ||
    observed?.statementTimeoutMs !== 3000 ||
    observed?.maxCommandLeases !== 2 ||
    !Number.isInteger(observed?.pidA) ||
    !Number.isInteger(observed?.pidB) ||
    observed.pidA === observed.pidB ||
    observed?.unresolvedMigrations !== 0 ||
    observed?.privateDefaultExecutePublic !== false ||
    observed?.runtimeCanWriteAdmission !== false ||
    observed?.publicCanWriteAdmission !== false ||
    observed?.inheritedCanWriteAdmission !== false ||
    observed?.runtimeCanMintProof !== false ||
    observed?.allRequiredCapabilities !== true
  ) {
    throw new Error("ISSUE416_RACE_FUTURE_PG17_OBSERVATION_INCOMPLETE");
  }
  return "SOURCE_VALIDATION_ONLY";
}
