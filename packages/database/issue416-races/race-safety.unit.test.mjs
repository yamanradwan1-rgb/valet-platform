import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";

import {
  RACE_STATUS,
  REQUIRED_CAPABILITIES,
  assertRaceRuntimeAuthorized,
  raceReadiness,
  validateFuturePg17Observation,
} from "./race-readiness.mjs";
import { executePg17RaceTrial } from "./race-runner.mjs";
import {
  BLOCKING_WITNESS_SQL,
  validateBlockingWitness,
} from "./race-pg-observer.mjs";
import {
  assertFailureClassification,
  assertNoSecretEvidence,
  classifyTransactionEvidence,
} from "./race-phase-evidence.mjs";

test("W9 recovery denial precedes every connector callback and release flag", async () => {
  let invoked = 0;
  const adapter = new Proxy(
    {},
    {
      get() {
        invoked++;
        throw Error("connector touched");
      },
    },
  );
  const old = process.env.ISSUE416_R02_PG17_RELEASE;
  try {
    process.env.ISSUE416_R02_PG17_RELEASE =
      "OWNER_RELEASED_AFTER_MIGRATION113_RECOVERY_AND_W9_REATTESTATION";
    assert.throws(assertRaceRuntimeAuthorized, /BLOCKED_PG17_NOT_RUN/);
    await assert.rejects(
      executePg17RaceTrial({
        id: 16,
        direction: "A-first",
        outcome: "C",
        adapter,
      }),
      /W9_MIGRATION113_UNRESOLVED_AND_LEASE_NOT_ATTESTED/,
    );
    assert.equal(invoked, 0);
    assert.equal(raceReadiness().pg17Executed, false);
    assert.equal(raceReadiness().status, RACE_STATUS);
  } finally {
    if (old === undefined) delete process.env.ISSUE416_R02_PG17_RELEASE;
    else process.env.ISSUE416_R02_PG17_RELEASE = old;
  }
});

test("future target observation cannot replace independent attestation", () => {
  assert.ok(
    REQUIRED_CAPABILITIES.includes(
      "per-connection-independent-lease-owner-proof",
    ),
  );
  assert.throws(() => validateFuturePg17Observation({}), /INCOMPLETE/);
  assertLookingValidObservationIsStillNotRelease();
});

function assertLookingValidObservationIsStillNotRelease() {
  const snapshot = {
    serverVersion: 170006,
    database: "issue416_w9_db",
    databaseOwner: "issue416_w9_owner",
    hostname: "127.0.0.1",
    mappedPort: 55416,
    postgresImage: "postgres:17-alpine",
    inRecovery: false,
    isSuperuser: false,
    canBypassRls: false,
    canCreateRole: false,
    transactionIsolation: "read committed",
    lockTimeoutMs: 2000,
    statementTimeoutMs: 3000,
    maxCommandLeases: 2,
    pidA: 101,
    pidB: 102,
    unresolvedMigrations: 0,
    privateDefaultExecutePublic: false,
    runtimeCanWriteAdmission: false,
    publicCanWriteAdmission: false,
    inheritedCanWriteAdmission: false,
    runtimeCanMintProof: false,
    allRequiredCapabilities: true,
  };
  assert.equal(
    validateFuturePg17Observation(snapshot),
    "SOURCE_VALIDATION_ONLY",
  );
  assert.throws(assertRaceRuntimeAuthorized, /BLOCKED/);
  assert.throws(
    () =>
      validateFuturePg17Observation({
        ...snapshot,
        pidB: 101,
      }),
    /INCOMPLETE/,
  );
  assert.throws(
    () =>
      validateFuturePg17Observation({
        ...snapshot,
        runtimeCanWriteAdmission: true,
      }),
    /INCOMPLETE/,
  );
}

test("observer SQL captures real physical lock resources without exposing query text", () => {
  assert.match(BLOCKING_WITNESS_SQL, /pg_blocking_pids/);
  assert.match(BLOCKING_WITNESS_SQL, /pg_locks/);
  assert.doesNotMatch(BLOCKING_WITNESS_SQL, /\bpg_sleep\s*\(/i);
  assert.doesNotMatch(BLOCKING_WITNESS_SQL, /\bquery\s+AS/i);
  const rows = [
    {
      waiting_pid: 101,
      holding_pid: 102,
      holding_granted: true,
      wait_event_type: "Lock",
      blocking_pids: [102],
      waiting_lock_type: "advisory",
    },
  ];
  const target = { waitingPid: 101, holdingPid: 102, namedFence: "owner03" };
  const witness = validateBlockingWitness(rows, target);
  assert.equal(witness.namedFenceVerified, false); // Cannot infer logical rank.
  assert.equal(witness.pg17Acceptance, "NOT_RUN");
  assert.throws(
    () =>
      validateBlockingWitness(rows, {
        ...target,
        holdingPid: 103,
      }),
    /NOT_OBSERVED/,
  );
});

test("COMMIT U is never equated with disconnect D or timeout T", () => {
  assert.equal(
    classifyTransactionEvidence({
      phase: "commit-sent",
      serverCommitObserved: false,
      rollbackObserved: false,
    }),
    "U",
  );
  assert.equal(
    classifyTransactionEvidence({
      phase: "server-committed",
      serverCommitObserved: true,
      rollbackObserved: false,
    }),
    "C",
  );
  assert.equal(
    classifyTransactionEvidence({
      phase: "server-rolled-back",
      serverCommitObserved: false,
      rollbackObserved: true,
    }),
    "R",
  );
  assert.throws(
    () =>
      classifyTransactionEvidence({
        phase: "server-committed",
        serverCommitObserved: false,
        rollbackObserved: false,
      }),
    /TERMINAL_PHASE_NOT_PROVEN/,
  );
  assert.throws(
    () =>
      classifyTransactionEvidence({
        phase: "server-rolled-back",
        serverCommitObserved: false,
        rollbackObserved: false,
      }),
    /TERMINAL_PHASE_NOT_PROVEN/,
  );
  assert.equal(
    assertFailureClassification({
      sqlstate: "57014",
      phase: "commit-sent",
      rollbackObserved: false,
    }),
    "U",
  );
  assert.throws(
    () =>
      assertFailureClassification({
        sqlstate: "55P03",
        phase: "before-commit",
        rollbackObserved: false,
      }),
    /ROLLBACK_EVIDENCE_MISSING/,
  );
  assert.equal(
    assertFailureClassification({
      sqlstate: "55P03",
      phase: "before-commit",
      rollbackObserved: true,
    }),
    "T",
  );
  assert.throws(
    () =>
      assertFailureClassification({
        sqlstate: "08006",
        phase: "before-commit",
        rollbackObserved: true,
      }),
    /DISCONNECT_PHASE_UNVERIFIED/,
  );
  assert.equal(
    assertFailureClassification({
      sqlstate: "08006",
      phase: "before-commit",
      rollbackObserved: true,
      preCommitDisconnectObserved: true,
    }),
    "D",
  );
});

test("evidence shape rejects secret fields and free-form credential values", () => {
  assert.equal(assertNoSecretEvidence({ status: "BLOCKED", count: 0 }), true);
  assert.throws(
    () => assertNoSecretEvidence({ password: "redacted" }),
    /SECRET/,
  );
  assert.throws(
    () =>
      assertNoSecretEvidence({
        event: "genuine token value outside allowlist",
      }),
    /UNREDACTED/,
  );
  assert.throws(
    () =>
      assertNoSecretEvidence({
        event: "john",
      }),
    /UNREDACTED/,
  );
});
