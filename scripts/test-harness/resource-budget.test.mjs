import assert from "node:assert/strict";
import test from "node:test";

import { classifyHarnessFailure } from "./command-runner.mjs";
import {
  assertPostgresBudget,
  postgresProfile,
  supportedWorkerCount,
} from "./resource-budget.mjs";

const localCluster = {
  maxConnections: 100,
  nonTestAllowance: 20,
  reservedConnections: 0,
  superuserReservedConnections: 3,
};

test("race profile admits exactly two safe local file workers", () => {
  const profile = postgresProfile("api-race");
  assert.equal(profile.connectionEnvelope, 38);
  assert.equal(supportedWorkerCount({ ...localCluster, profile }), 2);
  assert.equal(profile.fileWorkers, 2);
  assert.deepEqual(
    assertPostgresBudget({ ...localCluster, profile, workers: 2 }),
    {
      admittedConnections: 76,
      availableForTests: 77,
      headroom: 1,
      maxConnections: 100,
      nonTestAllowance: 20,
      reservedConnections: 0,
      reservedSlots: 3,
      superuserReservedConnections: 3,
      workers: 2,
    },
  );
  assert.throws(
    () => assertPostgresBudget({ ...localCluster, profile, workers: 3 }),
    /budget exceeded.*available=77, admitted=114/i,
  );
});

test("long API projects use one file worker after repeated native fork crashes", () => {
  assert.equal(postgresProfile("api-standard").fileWorkers, 1);
  assert.equal(postgresProfile("api-compound").fileWorkers, 1);
  assert.equal(postgresProfile("database-direct").fileWorkers, 2);
  assert.equal(postgresProfile("database-provision").fileWorkers, 2);
});

test("profiles include pool, direct client, and subprocess envelopes", () => {
  assert.deepEqual(
    Object.fromEntries(
      [
        "api-standard",
        "api-compound",
        "api-race",
        "database-direct",
        "database-provision",
      ].map((name) => [name, postgresProfile(name).connectionEnvelope]),
    ),
    {
      "api-standard": 20,
      "api-compound": 24,
      "api-race": 38,
      "database-direct": 11,
      "database-provision": 21,
    },
  );
});

test("failure diagnostics separate resource and execution classes", () => {
  assert.equal(
    classifyHarnessFailure("remaining connection slots are reserved"),
    "postgres-connection-pressure",
  );
  assert.equal(
    classifyHarnessFailure("FATAL ERROR: JavaScript heap out of memory"),
    "memory-pressure",
  );
  assert.equal(
    classifyHarnessFailure("worker 2 exited unexpectedly"),
    "worker-process-failure",
  );
  assert.equal(
    classifyHarnessFailure("prisma migrate deploy failed"),
    "migration-failure",
  );
  assert.equal(
    classifyHarnessFailure("AssertionError: expected 1 to be 2"),
    "test-failure",
  );
});
