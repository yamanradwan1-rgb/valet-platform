import assert from "node:assert/strict";
import test from "node:test";
import { inspectSyntheticTarget, refuseUnattestedPg17Run,
} from "../disposable-pg17-preflight.mjs";
import { CHECKPOINTS, describeSafeL2Rehearsal, evaluateL2Evidence,
} from "../cutover-plan.mjs";

const target = {
  host: "127.0.0.1", port: 48823,
  project: "issue416_w5_synthetic_test",
  container: "issue416_w5_synthetic_pg",
  database: "issue416_w5_synthetic_db",
  runtimeRole: "issue416_w5_synthetic_runtime",
  migrationRole: "issue416_w5_synthetic_migration",
  volume: "issue416_w5_synthetic_volume",
};
const observation = {
  dockerProject: target.project, container: target.container,
  volume: target.volume, image: "postgres:17-alpine",
  exposedHost: target.host, exposedPort: target.port,
  labels: { "vaylet.environment": "isolated-test",
    "vaylet.issue": "416-w5" },
  serverMajor: 17, database: target.database,
  runtimeRole: target.runtimeRole, migrationRole: target.migrationRole,
  runtimeIsOwner: false, migrationIsOwner: true,
  exclusiveLease: "issue416-w5",
  cleanChildEnv: true, noDestructiveHarnessFallback: true,
  currentOwnerApproved: true,
};

test("isolated synthetic target has shape only; not an actual PG attestation", () => {
  const result = inspectSyntheticTarget(target, observation);
  assert.equal(result.allowed, false);
  assert.equal(result.status, "SYNTHETIC_SHAPE_ONLY");
  assert.equal(result.shapeMatched, true);
  assert.equal(result.needsIndependentDockerAndSqlObservation, true);
});
test("existing QA 45432 and default 5432 are denied", () => {
  for (const port of [45432, 5432]) {
    assert.equal(inspectSyntheticTarget({ ...target, port },
      { ...observation, exposedPort: port }).allowed, false);
  }
});
test("wrong DB/project/PG version or Docker labels block isolation", () => {
  assert.equal(inspectSyntheticTarget({ ...target, database: "vaylet_test" },
    observation).allowed, false);
  assert.equal(inspectSyntheticTarget(target, { ...observation,
    serverMajor: 16 }).allowed, false);
  assert.equal(inspectSyntheticTarget(target, { ...observation,
    labels: { "vaylet.environment": "QA" } }).allowed, false);
});
test("shared runtime/admin role and missing exclusive lease are denied", () => {
  assert.equal(inspectSyntheticTarget({ ...target,
    migrationRole: target.runtimeRole }, observation).allowed, false);
  assert.equal(inspectSyntheticTarget(target, { ...observation,
    exclusiveLease: null }).allowed, false);
  assert.equal(inspectSyntheticTarget(target, { ...observation,
    noDestructiveHarnessFallback: false }).allowed, false);
});
test("no existing resource can be targeted by this offline-only tooling", () => {
  assert.throws(() => refuseUnattestedPg17Run(),
    /L2_NO_VERIFIED_EXCLUSIVE_DISPOSABLE_PG17_LEASE/);
  assert.equal(inspectSyntheticTarget(null, null).allowed, false);
});
test("C0-C6 plans remain explicitly execution blocked", () => {
  const result = evaluateL2Evidence({});
  assert.equal(result.canRunLiveCutover, false);
  assert.equal(result.canRunExistingQaOrProduction, false);
  assert.equal(result.results.every((gate) => gate.status === "BLOCKED"), true);
  assert.deepEqual(CHECKPOINTS, ["C0", "C1", "C2", "C3", "C4", "C5", "C6"]);
  assert.equal(describeSafeL2Rehearsal().status, "PLAN_ONLY_NOT_EXECUTED");
});
test("self-declared verified JSON never becomes deployment authorization", () => {
  const result = evaluateL2Evidence({
    OWNER_L1_L2_U1_S1_APPROVAL: { status: "VERIFIED",
      reference: "synthetic-owner-document-001",
      verifiedBy: "someone", observedAtMs: 123456 },
  });
  assert.equal(result.canRunLiveCutover, false);
  assert.equal(result.results[0].status, "EVIDENCE_PRESENT_UNVERIFIED");
});
